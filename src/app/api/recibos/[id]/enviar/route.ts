import { NextResponse } from "next/server";
import { enviarObjeto } from "@/lib/r2";
import {
  DESLIGADO,
  GRANDE_DEMAIS,
  PDF,
  SEM_SESSAO,
  TIPO_RECUSADO,
  erro,
  recibosAtivos,
  sessao,
  tamanhoMaximo,
} from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Passo 2 do envio: o navegador manda a foto já comprimida (ou o PDF como
 * está) e o servidor grava no R2.
 *
 * Já foi PUT direto do navegador no R2, por link assinado. Falhava no
 * celular com "Failed to fetch" mesmo com o CORS do bucket certo, e o
 * navegador não diz por quê. Passando por aqui, o celular só fala com o
 * próprio app. O limite de corpo da Vercel (4,5 MB) não pesa: a foto chega
 * com algumas centenas de KB, e tamanhoMaximo() corta antes.
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
  if (recibo.uploaded_at) return erro("Este recibo já foi enviado.", 409);

  // O tipo foi conferido no passo 1; aqui só não pode mudar no caminho.
  if (request.headers.get("content-type") !== recibo.mime_type) {
    return erro(TIPO_RECUSADO, 415);
  }

  const limite = tamanhoMaximo(recibo.mime_type);
  const declarado = Number(request.headers.get("content-length"));
  if (declarado > limite) return erro(GRANDE_DEMAIS(recibo.mime_type), 413);

  const dados = await request.arrayBuffer();
  if (dados.byteLength === 0) return erro("Arquivo vazio.", 400);
  if (dados.byteLength > limite) return erro(GRANDE_DEMAIS(recibo.mime_type), 413);

  // PDF de verdade começa com "%PDF-". Foto a rota não abre (veio do canvas
  // do app); PDF vem como a pessoa tinha, então confere o começo.
  if (recibo.mime_type === PDF && new TextDecoder().decode(dados.slice(0, 5)) !== "%PDF-") {
    return erro("Esse arquivo não parece um PDF. Tente baixar o comprovante de novo.", 415);
  }

  try {
    await enviarObjeto(recibo.r2_key, recibo.mime_type, dados);
  } catch (e) {
    console.error("[api/recibos/enviar]", e);
    return erro("Não deu para guardar o recibo agora. Tente de novo.", 502, String(e));
  }

  return new NextResponse(null, { status: 204 });
}
