import { NextResponse } from "next/server";
import { enviarObjeto } from "@/lib/r2";
import {
  DESLIGADO,
  SEM_SESSAO,
  TAMANHO_MAXIMO,
  erro,
  recibosAtivos,
  sessao,
} from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Passo 2 do envio: o navegador manda a foto já comprimida e o servidor
 * grava no R2.
 *
 * Já foi PUT direto do navegador no R2, por link assinado. Falhava no
 * celular com "Failed to fetch" mesmo com o CORS do bucket certo, e o
 * navegador não diz por quê. Passando por aqui, o celular só fala com o
 * próprio app. O limite de corpo da Vercel (4,5 MB) não pesa: a foto chega
 * com algumas centenas de KB, e TAMANHO_MAXIMO corta antes.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  const { id } = await params;

  // Pela sessão: se o recibo não é dela, a RLS faz ele não existir.
  const { data: recibo } = await s.supabase
    .from("receipts")
    .select("r2_key, mime_type, uploaded_at")
    .eq("id", id)
    .maybeSingle();
  if (!recibo) return erro("Recibo não encontrado.", 404);
  if (recibo.uploaded_at) return erro("Esta foto já foi enviada.", 409);

  // O tipo foi conferido no passo 1; aqui só não pode mudar no caminho.
  if (request.headers.get("content-type") !== recibo.mime_type) {
    return erro("Envie uma foto (JPEG, PNG ou WebP).", 415);
  }

  const declarado = Number(request.headers.get("content-length"));
  if (declarado > TAMANHO_MAXIMO) {
    return erro("Foto grande demais, mesmo depois de comprimir.", 413);
  }

  const dados = await request.arrayBuffer();
  if (dados.byteLength === 0) return erro("Arquivo vazio.", 400);
  if (dados.byteLength > TAMANHO_MAXIMO) {
    return erro("Foto grande demais, mesmo depois de comprimir.", 413);
  }

  try {
    await enviarObjeto(recibo.r2_key, recibo.mime_type, dados);
  } catch (e) {
    console.error("[api/recibos/enviar]", e);
    return erro("Não deu para guardar a foto agora. Tente de novo.", 502, String(e));
  }

  return new NextResponse(null, { status: 204 });
}
