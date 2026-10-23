import { NextResponse } from "next/server";
import { abrirPonte } from "@/lib/orcamentos";
import { erro } from "@/lib/rotas";

export const runtime = "nodejs";

type ItemDeLa = { name?: unknown };
type OrcamentoDeLa = {
  id: string;
  number: number;
  revision: number;
  status: string;
  client_id: string | null;
  client: { name?: unknown; phone?: unknown } | null;
  service_address: string | null;
  issue_date: string;
  items: ItemDeLa[] | null;
  total: number | string;
  payment_terms: string | null;
  updated_at: string;
};

/**
 * Orçamentos aprovados (ou já executados) que ainda não viraram
 * recebimento nem foram tirados da lista (C27). Quem lança é a pessoa, no
 * formulário de recebimento, que já abre preenchido.
 */
export async function GET() {
  const p = await abrirPonte();
  if (p instanceof Response) return p;

  const { data, error } = await p.db
    .from("quotes")
    .select("id, number, revision, status, client_id, client, service_address, issue_date, items, total, payment_terms, updated_at")
    .eq("company_id", p.companyId)
    .in("status", ["aprovado", "executado"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) return erro("Não deu para buscar os orçamentos aprovados.", 502, error.message);

  const orcamentos = (data ?? []) as OrcamentoDeLa[];
  const ids = orcamentos.map((o) => o.id);
  if (!ids.length) return NextResponse.json({ aprovados: [] });

  // Daqui, com a sessão: a RLS mostra os recebimentos dos sócios também.
  const [lancados, ignorados] = await Promise.all([
    p.supabase.from("incomes").select("quote_id").in("quote_id", ids),
    p.supabase.from("quote_dismissals").select("quote_id").in("quote_id", ids),
  ]);
  if (lancados.error || ignorados.error)
    return erro(
      "Não deu para conferir o que já foi lançado. A migração 023 pode não ter rodado ainda.",
      500,
      (lancados.error ?? ignorados.error)?.message
    );
  const fora = new Set([
    ...(lancados.data ?? []).map((r) => r.quote_id as string),
    ...(ignorados.data ?? []).map((r) => r.quote_id as string),
  ]);

  const aprovados = orcamentos
    .filter((o) => !fora.has(o.id))
    .map((o) => ({
      id: o.id,
      numero: String(o.number).padStart(4, "0") + (o.revision > 0 ? `-R${o.revision}` : ""),
      status: o.status,
      cliente: typeof o.client?.name === "string" ? o.client.name : "",
      cliente_id: o.client_id,
      telefone: typeof o.client?.phone === "string" ? o.client.phone : null,
      endereco: o.service_address,
      data: o.issue_date,
      itens: (o.items ?? []).map((i) => (typeof i.name === "string" ? i.name : "")).filter(Boolean),
      total: Number(o.total),
      pagamento: o.payment_terms,
    }));

  return NextResponse.json({ aprovados });
}
