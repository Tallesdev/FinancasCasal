"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { MonthlyBars, RankBar } from "@/components/charts";
import { Dot, ErrorNote, Loading, PageTitle } from "@/components/ui";
import { money, monthName, percent, yearRange } from "@/lib/format";
import type { CategoryRankingRow, MonthlySummaryRow } from "@/lib/types";

export default function RelatoriosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userIds, scope } = useScope();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const [summary, setSummary] = useState<MonthlySummaryRow[]>([]);
  const [ranking, setRanking] = useState<CategoryRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { from, to } = yearRange(year);

    const [summaryResult, rankingResult] = await Promise.all([
      supabase.rpc("monthly_summary", { p_from: from, p_to: to }),
      supabase.rpc("category_ranking", { p_from: from, p_to: to }),
    ]);

    if (summaryResult.error || rankingResult.error) {
      setError("Não deu para carregar o relatório do ano.");
      setLoading(false);
      return;
    }

    setError(null);
    setSummary(summaryResult.data as MonthlySummaryRow[]);
    setRanking(rankingResult.data as CategoryRankingRow[]);
    setLoading(false);
  }, [supabase, year]);

  useEffect(() => {
    load();
  }, [load]);

  /** Os 12 meses do ano, somados dentro do escopo. */
  const series = useMemo(() => {
    const months = Array.from(
      { length: 12 },
      (_, index) => `${year}-${String(index + 1).padStart(2, "0")}-01`
    );

    const byMonth: Record<
      string,
      { income: number; expense: number; investment: number }
    > = {};
    for (const key of months)
      byMonth[key] = { income: 0, expense: 0, investment: 0 };

    for (const row of summary) {
      if (!userIds.includes(row.user_id)) continue;
      const key = `${row.month.slice(0, 7)}-01`;
      if (!byMonth[key]) continue;
      byMonth[key].income += Number(row.income);
      byMonth[key].expense += Number(row.expense);
      byMonth[key].investment += Number(row.investment);
    }

    return months.map((key) => ({ month: key, ...byMonth[key] }));
  }, [summary, userIds, year]);

  const totals = series.reduce(
    (acc, row) => ({
      income: acc.income + row.income,
      expense: acc.expense + row.expense,
      investment: acc.investment + row.investment,
    }),
    { income: 0, expense: 0, investment: 0 }
  );

  /** Média só sobre os meses que tiveram movimento — senão o ano inteiro dilui. */
  const activeMonths =
    series.filter((row) => row.income > 0 || row.expense > 0).length || 1;

  /** Ranking somado por NOME, depois do filtro de escopo. */
  const categories = useMemo(() => {
    const totalsByName: Record<
      string,
      { total: number; entries: number; color: string }
    > = {};

    for (const row of ranking) {
      if (!userIds.includes(row.user_id)) continue;
      const current = totalsByName[row.category_name] ?? {
        total: 0,
        entries: 0,
        color: row.color,
      };
      current.total += Number(row.total);
      current.entries += Number(row.entries);
      totalsByName[row.category_name] = current;
    }

    return Object.entries(totalsByName)
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.total - a.total);
  }, [ranking, userIds]);

  const years = Array.from(
    { length: 5 },
    (_, index) => new Date().getFullYear() - 2 + index
  );

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Relatórios"
        description={
          scope === "us"
            ? "O ano dos dois, com os números somados."
            : "O seu ano, mês a mês."
        }
        action={
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1">
            {years.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === year}
                onClick={() => setYear(option)}
                className={[
                  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  option === year
                    ? "bg-[var(--scope)] text-[var(--color-ink)]"
                    : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                ].join(" ")}
              >
                {option}
              </button>
            ))}
          </div>
        }
      />

      <nav className="flex gap-2" aria-label="Tipo de relatório">
        <span
          aria-current="page"
          className="rounded-full bg-[var(--scope)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)]"
        >
          Mês a mês
        </span>
        <Link
          href="/relatorios/ciclo"
          className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-sm text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
        >
          Por ciclo
        </Link>
      </nav>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Summary
              label="Entrou no ano"
              value={totals.income}
              tone="var(--color-in)"
            />
            <Summary
              label="Saiu no ano"
              value={totals.expense}
              tone="var(--color-out)"
            />
            <Summary
              label="Média de entrada"
              value={totals.income / activeMonths}
              tone="var(--color-in)"
              hint="por mês com movimento"
            />
            <Summary
              label="Média de saída"
              value={totals.expense / activeMonths}
              tone="var(--color-out)"
              hint="por mês com movimento"
            />
          </div>

          <section className="card px-4 py-5">
            <h2 className="mb-1 text-sm font-semibold">{year} mês a mês</h2>
            <p className="mb-3 text-xs text-[var(--color-text-faint)]">
              Entrada, saída e investimento na mesma escala.
            </p>
            <MonthlyBars
              data={series}
              series={["income", "expense", "investment"]}
              height={300}
            />
          </section>

          <section className="card px-4 py-5">
            <h2 className="mb-3 text-sm font-semibold">Gasto por categoria</h2>

            {categories.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
                Nenhum gasto lançado em {year}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] text-sm">
                  <caption className="sr-only">
                    Total gasto por categoria em {year}
                  </caption>
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-faint)]">
                      <th scope="col" className="pb-2 font-medium">
                        Categoria
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Total
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        % do total
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Lançamentos
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category) => (
                      <tr
                        key={category.name}
                        className="border-t border-[var(--color-line)]"
                      >
                        <td className="py-2.5 pr-3">
                          <span className="flex items-center gap-2">
                            <Dot color={category.color} />
                            <span className="truncate">{category.name}</span>
                          </span>
                          <span className="mt-1.5 block max-w-[12rem]">
                            <RankBar
                              value={category.total}
                              total={categories[0].total}
                              color={category.color}
                            />
                          </span>
                        </td>
                        <td className="money py-2.5 text-right align-top font-medium">
                          {money(category.total)}
                        </td>
                        <td className="py-2.5 text-right align-top text-[var(--color-text-dim)]">
                          {percent(category.total, totals.expense)}
                        </td>
                        <td className="py-2.5 text-right align-top text-[var(--color-text-dim)]">
                          {category.entries}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card px-4 py-5">
            <h2 className="mb-3 text-sm font-semibold">Tabela do ano</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-faint)]">
                    <th scope="col" className="pb-2 font-medium">
                      Mês
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Entrou
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Saiu
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Investiu
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Sobrou
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {series.map((row) => {
                    const left = row.income - row.expense - row.investment;
                    return (
                      <tr
                        key={row.month}
                        className="border-t border-[var(--color-line)]"
                      >
                        <td className="py-2 pr-3">{monthName(row.month)}</td>
                        <td className="money py-2 text-right text-[var(--color-in)]">
                          {money(row.income)}
                        </td>
                        <td className="money py-2 text-right text-[var(--color-out)]">
                          {money(row.expense)}
                        </td>
                        <td className="money py-2 text-right text-[var(--color-invest)]">
                          {money(row.investment)}
                        </td>
                        <td
                          className={[
                            "money py-2 text-right font-medium",
                            left < 0 ? "text-[var(--color-out)]" : "",
                          ].join(" ")}
                        >
                          {money(left)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: string;
  hint?: string;
}) {
  return (
    <div className="card flex flex-col gap-1 px-4 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
        {label}
      </span>
      <strong
        style={{ color: tone }}
        className="money text-xl font-semibold sm:text-2xl"
      >
        {money(value)}
      </strong>
      {hint && (
        <span className="text-[11px] text-[var(--color-text-faint)]">
          {hint}
        </span>
      )}
    </div>
  );
}
