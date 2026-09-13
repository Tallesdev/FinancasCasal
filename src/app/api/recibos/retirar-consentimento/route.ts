import { NextResponse } from "next/server";
import { apagarPrefixo, r2Configurado } from "@/lib/r2";
import { SEM_SESSAO, erro, sessao } from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Retirar o consentimento de recibos. Retirar é pedir pra parar de tratar,
 * e guardar é tratar: então os recibos guardados vão junto — arquivos no R2
 * e linhas no banco — e só depois a coluna volta a nulo. (FASE_E.md §3.6)
 *
 * A tela avisa quantos recibos serão apagados antes de chamar.
 */
export async function POST() {
  const s = await sessao();
  if (!s) return SEM_SESSAO();

  const { count } = await s.supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", s.userId);

  // Sem recibo nenhum, não depende do R2 — ex: app ainda sem R2 configurado.
  if (count) {
    if (!r2Configurado()) {
      return erro(
        "Não deu para apagar seus recibos agora (armazenamento indisponível). Nada foi alterado.",
        503
      );
    }
    try {
      await apagarPrefixo(`${s.userId}/`);
    } catch (e) {
      return erro("Não deu para apagar seus recibos agora. Nada foi alterado.", 502, String(e));
    }
    const { error: falha } = await s.supabase
      .from("receipts")
      .delete()
      .eq("user_id", s.userId);
    if (falha) return erro("As fotos foram apagadas, mas os registros não. Tente de novo.", 500);
  }

  const { error: falha } = await s.supabase
    .from("profiles")
    .update({ receipts_consent_at: null })
    .eq("id", s.userId);
  if (falha) return erro("Não deu para salvar. Tente de novo.", 500);

  return NextResponse.json({ ok: true, apagados: count ?? 0 });
}
