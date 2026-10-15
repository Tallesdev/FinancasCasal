"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { ErrorNote, Loading } from "./ui";
import { formatDate, money, monthLabel } from "@/lib/format";
import { chaveDoCliente, lucroPorCliente } from "@/lib/clientes";
import { mesesDe } from "@/lib/recebimentos";
import type { ExpenseOccurrence, Income } from "@/lib/types";

type GastoComCliente = { expense_id: string; client: string | null; amount: number; description: string; month: string };

/**
 * Lucro por cliente no ano (FASE_F.md, F5.1). Só empresa, e sempre a
 * empresa inteira (como a tela Lucro): o seletor de sócio não muda.
 * Toque num cliente pra ver de onde vem cada número.
 */
export function LucroPorCliente({ ano }: { ano: number }) {
  const supabase = useMemo(() => createClient(), []);
  const { members } = useScope();
  const ids = useMemo(() => members.map((m) => m.id), [members]);

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [gastos, setGastos] = useState<GastoComCliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [incomesResult, expensesResult, ocorrenciasResult] = await Promise.all([
      supabase.from("incomes").select("*"),
      supabase.from("expenses").select("id, user_id, client"),
      supabase.rpc("expense_occurrences", { p_from: `${ano}-01-01`, p_to: `${ano}-12-31` }),
    ]);
    if (incomesResult.error || expensesResult.error || ocorrenciasResult.error) {
      setError("Não deu para carregar o lucro por cliente.");
      setLoading(false);
      return;
    }
    const clientePorGasto = new Map(
      ((expensesResult.data ?? []) as { id: string; user_id: string; client: string | null }[])
        .filter((e) => ids.includes(e.user_id))
        .map((e) => [e.id, e.client ?? null])
    );
    setIncomes(((incomesResult.data ?? []) as Income[]).filter((i) => ids.includes(i.user_id)));
    setGastos(
      ((ocorrenciasResult.data ?? []) as ExpenseOccurrence[])
        .filter((o) => clientePorGasto.has(o.expense_id))
        .map((o) => ({
          expense_id: o.expense_id,
          client: clientePorGasto.get(o.expense_id) ?? null,
          amount: Number(o.amount),
          description: o.description,
          month: o.month,
        }))
    );
    setError(null);
    setLoading(false);
  }, [supabase, ano, ids]);

  useEffect(() => {
    load();
  }, [load]);

  const resultado = useMemo(() => lucroPorCliente(ano, incomes, gastos), [ano, incomes, gastos]);

  /** De onde vem cada número do cliente aberto. */
  const detalhe = useMemo(() => {
    if (!aberto) return null;
    const entradas = incomes
      .filter((i) => i.client && chaveDoCliente(i.client) === aberto)
      .map((i) => {
        const meses = mesesDe(i, `${ano}-12-01`).filter((m) => m >= `${ano}-01-01`);
        return { id: i.id, texto: i.source, quando: i.start_date, qtd: meses.length, valor: meses.length * Number(i.amount) };
      })
      .filter((e) => e.qtd > 0);
    const saidas = gastos.filter((g) => g.client && chaveDoCliente(g.client) === aberto);
    return { entradas, saidas };
  }, [aberto, incomes, gastos, ano]);

  return (
    <section className="card px-4 py-5">
      <h2 className="mb-1 text-sm font-semibold">Lucro por cliente</h2>
      <p className="mb-3 text-xs text-[var(--color-text-faint)]">
        Faturado do cliente em {ano} menos os gastos marcados com o nome dele. Toque pra ver o detalhe.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : resultado.clientes.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
          Nenhum recebimento ou gasto com cliente em {ano}. Preencha &ldquo;Cliente&rdquo; ao lançar
          pra ver aqui.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-line)]">
          {resultado.clientes.map((c) => {
            const estaAberto = aberto === c.chave;
            return (
              <li key={c.chave} className="py-2.5">
                <button
                  type="button"
                  aria-expanded={estaAberto}
                  onClick={() => setAberto(estaAberto ? null : c.chave)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="block text-xs text-[var(--color-text-faint)]">
                      Faturou <span className="money">{money(c.faturou)}</span> · gastou{" "}
                      <span className="money">{money(c.gastou)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="money block font-semibold"
                      style={{ color: c.lucro < 0 ? "var(--color-out)" : "var(--color-in)" }}
                    >
                      {c.lucro < 0 ? `− ${money(-c.lucro)}` : money(c.lucro)}
                    </span>
                    {c.margem !== null && (
                      <span className="block text-[11px] text-[var(--color-text-faint)]">
                        {c.margem.toLocaleString("pt-BR")}% de margem
                      </span>
                    )}
                  </span>
                </button>

                {estaAberto && detalhe && (
                  <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5 text-xs">
                    {detalhe.entradas.map((e) => (
                      <p key={e.id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate text-[var(--color-text-dim)]">
                          {e.texto} · {formatDate(e.quando)}
                          {e.qtd > 1 ? ` · ${e.qtd} meses em ${ano}` : ""}
                        </span>
                        <span className="money shrink-0 text-[var(--color-in)]">{money(e.valor)}</span>
                      </p>
                    ))}
                    {detalhe.saidas.map((g) => (
                      <p key={`${g.expense_id}|${g.month}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate text-[var(--color-text-dim)]">
                          {g.description} · {monthLabel(g.month, true)}
                        </span>
                        <span className="money shrink-0 text-[var(--color-out)]">− {money(g.amount)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && (resultado.semCliente.faturou > 0 || resultado.semCliente.gastou > 0) && (
        <p className="mt-3 text-xs text-[var(--color-text-faint)]">
          Sem cliente: faturou <span className="money">{money(resultado.semCliente.faturou)}</span> e
          gastou <span className="money">{money(resultado.semCliente.gastou)}</span> (gasto geral da
          empresa, como combustível do mês, normalmente fica sem cliente mesmo).
        </p>
      )}
    </section>
  );
}
