import { NextResponse } from "next/server";
import { apagarObjeto, infoDoObjeto } from "@/lib/r2";
import {
  COLUNAS_PUBLICAS,
  DESLIGADO,
  SEM_SESSAO,
  TAMANHO_MAXIMO,
  clienteAdmin,
  erro,
  recibosAtivos,
  sessao,
} from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Passo 3 do envio: o navegador diz "subi", e o servidor confere no R2 em
 * vez de acreditar. Só então marca uploaded_at.
 *
 * O link assinado não limita tamanho nem tipo — quem limita é esta
 * conferência. Arquivo fora da regra é apagado na hora.
 *
 * Pode ser chamada de novo pra um envio que ficou "não concluído".
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  const { id } = await params;

  // Pela sessão: se o recibo não é dela, a RLS faz ele não existir.
  const { data: recibo } = await s.supabase
    .from("receipts")
    .select("id, r2_key, mime_type")
    .eq("id", id)
    .maybeSingle();
  if (!recibo) return erro("Recibo não encontrado.", 404);

  let info: Awaited<ReturnType<typeof infoDoObjeto>>;
  try {
    info = await infoDoObjeto(recibo.r2_key);
  } catch (e) {
    return erro("Não deu para conferir o envio agora.", 502, String(e));
  }

  if (!info) return erro("A foto não chegou. Tente enviar de novo.", 409);

  if (info.tamanho > TAMANHO_MAXIMO || !info.tipo.startsWith("image/")) {
    await apagarObjeto(recibo.r2_key).catch(() => {});
    await s.supabase.from("receipts").delete().eq("id", id);
    return erro("O arquivo enviado não é uma foto aceita.", 422);
  }

  const { data: atualizado, error: falha } = await clienteAdmin()
    .from("receipts")
    .update({ uploaded_at: new Date().toISOString(), size_bytes: info.tamanho })
    .eq("id", id)
    .eq("user_id", s.userId)
    .select(COLUNAS_PUBLICAS)
    .single();

  if (falha || !atualizado) {
    return erro("Não deu para concluir o envio.", 500, falha?.message);
  }

  return NextResponse.json({ recibo: atualizado });
}
