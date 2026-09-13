import { NextResponse } from "next/server";
import { apagarObjeto } from "@/lib/r2";
import { DESLIGADO, SEM_SESSAO, erro, recibosAtivos, sessao } from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Apagar um recibo: o arquivo primeiro, a linha depois. Na ordem inversa,
 * uma falha no meio deixaria arquivo no R2 sem nada que diga que ele existe.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  const { id } = await params;

  const { data: recibo } = await s.supabase
    .from("receipts")
    .select("r2_key")
    .eq("id", id)
    .maybeSingle();
  if (!recibo) return erro("Recibo não encontrado.", 404);

  try {
    await apagarObjeto(recibo.r2_key);
  } catch (e) {
    return erro("Não deu para apagar a foto agora. Tente de novo.", 502, String(e));
  }

  const { error: falha } = await s.supabase.from("receipts").delete().eq("id", id);
  if (falha) return erro("A foto foi apagada, mas o registro não. Tente de novo.", 500);

  return NextResponse.json({ ok: true });
}
