import { NextResponse } from "next/server";
import { TERMOS_VERSAO } from "@/lib/legal";
import { SEM_SESSAO, clienteAdmin, erro, sessao } from "@/lib/rotas";

export const runtime = "nodejs";

/**
 * Registrar o aceite da versão atual dos termos.
 *
 * Quem grava é o servidor, não o navegador: `terms_version` e
 * `terms_accepted_at` ficam fora dos grants de quem está logado (migração
 * 008, parte 3), justamente pra ninguém poder dizer que aceitou uma versão
 * que nunca leu. A versão vem daqui, nunca do corpo do pedido.
 */
export async function POST() {
  const s = await sessao();
  if (!s) return SEM_SESSAO();

  if (!process.env.SUPABASE_SECRET_KEY) {
    return erro("Registrar o aceite ainda não está configurado neste app.", 503);
  }

  const { error: falha } = await clienteAdmin()
    .from("profiles")
    .update({ terms_version: TERMOS_VERSAO, terms_accepted_at: new Date().toISOString() })
    .eq("id", s.userId);

  if (falha) {
    console.error("[api/termos/aceitar]", falha.message);
    return erro("Não deu para registrar o aceite. Tente de novo.", 500);
  }

  return NextResponse.json({ ok: true, versao: TERMOS_VERSAO });
}
