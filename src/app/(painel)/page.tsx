"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { ScopeHeading } from "@/components/ScopeHeading";
import { FaturaAviso } from "@/components/FaturaAviso";
import { MonthlyBars, RankBar } from "@/components/charts";
import {
  Button,
  Dot,
  ErrorNote,
  Loading,
  MonthNav,
  Tag,
} from "@/components/ui";
import {
  addMonths,
  firstDayOfMonth,
  money,
  monthLabel,
  percent,
  toISODate,
} from "@/lib/format";
import {
  EXPENSE_KIND_LABEL,
  type Category,
  type ExpenseOccurrence,
  type MonthlySummaryRow,
} from "@/lib/types";

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { userIds, scope } = useScope();

  const [month, setMonth] = useState(() =>
    firstDayOfMonth(toISODate(new Date()))
  );
  const [summary, setSummary] = useState<MonthlySummaryRow[]>([]);
  const [occurrences, setOccurrences] = useState<ExpenseOccurrence[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    // Seis meses até o mês visto, para o gráfico e o número do mês saírem
    // da mesma consulta.
    const from = addMonths(month, -5);

    const [summaryResult, occurrencesResult, categoriesResult] =
      await Promise.all([
        supabase.rpc("monthly_summary", { p_from: from, p_to: month }),
        supabase.rpc("expense_occurrences", { p_from: month, p_to: month }),
        supabase.from("categories").select("*"),
      ]);

    if (summaryResult.error || occurrencesResult.error) {
      setError("Não deu para carregar o resumo do mês.");
      setLoading(false);
      return;
    }

    setError(null);
    setSummary(summaryResult.data as MonthlySummaryRow[]);
    setOccurrences(occurrencesResult.data as ExpenseOccurrence[]);
    setCategories((categoriesResult.data ?? []) as Category[]);
    setLoading(false);
  }, [supabase, month]);

  useEffect(() => {
    load();
  }, [load]);

  /** Série de 6 meses, já somada dentro do escopo e sem buracos. */
  const series = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) =>
      addMonths(month, index - 5)
    );

    const empty = () => ({ income: 0, expense: 0, investment: 0 });
    const byMonth: Record<string, ReturnType<typeof empty>> = {};
    for (const key of months) byMonth[key] = empty();

    for (const row of summary) {
      if (!userIds.includes(row.user_id)) continue;
      const key = firstDayOfMonth(row.month);
      if (!byMonth[key]) continue;
      byMonth[key].income += Number(row.income);
      byMonth[key].expense += Number(row.expense);
      byMonth[key].investment += Number(row.investment);
    }

    return months.map((key) => ({ month: key, ...byMonth[key] }));
  }, [summary, userIds, month]);

  const current = series[series.length - 1] ?? {
    income: 0,
    expense: 0,
    investment: 0,
  };
  const balance = current.income - current.expense - current.investment;

  const categoryById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of categories) map[category.id] = category;
    return map;
  }, [categories]);

  const inScope = useMemo(
    () => occurrences.filter((o) => userIds.includes(o.user_id)),
    [occurrences, userIds]
  );

  /** Top 5 do mês, somando por NOME — igual ao ranking do relatório. */
  const topCategories = useMemo(() => {
    const totals: Record<string, { total: number; color: string }> = {};

    for (const occurrence of inScope) {
      const category = categoryById[occurrence.category_id ?? ""];
      const name = category?.name ?? "Sem categoria";
      if (!totals[name])
        totals[name] = { total: 0, color: category?.color ?? "#8B93A7" };
      totals[name].total += Number(occurrence.amount);
    }

    return Object.entries(totals)
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [inScope, categoryById]);

  const fixed = useMemo(
    () =>
      inScope
        .filter((occurrence) => occurrence.kind !== "variable")
        .sort((a, b) => Number(b.amount) - Number(a.amount)),
    [inScope]
  );

  const fixedTotal = fixed.reduce((sum, o) => sum + Number(o.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <ScopeHeading />

      <FaturaAviso />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={setMonth} />
        <Link href="/gastos">
          <Button>Novo gasto</Button>
        </Link>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Entrou" value={current.income} tone="var(--color-in)" />
            <Stat label="Saiu" value={current.expense} tone="var(--color-out)" />
            <Stat
              label="Investiu"
              value={current.investment}
              tone="var(--color-invest)"
            />
            <Stat
              label="Sobrou"
              value={balance}
              tone={
                balance < 0 ? "var(--color-out)" : "var(--color-text)"
              }
              hint={
                balance < 0
                  ? "Gastou mais do que entrou."
                  : "Depois de gastos e aportes."
              }
            />
          </div>

          <section className="card px-4 py-5">
            <h2 className="mb-1 text-sm font-semibold">Últimos 6 meses</h2>
            <p className="mb-3 text-xs text-[var(--color-text-faint)]">
              O que entrou contra o que saiu, mês a mês.
            </p>
            <MonthlyBars data={series} series={["income", "expense"]} />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card px-4 py-5">
              <h2 className="mb-3 text-sm font-semibold">
                Onde foi o dinheiro
              </h2>
              {topCategories.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
                  Nenhum gasto em {monthLabel(month)}.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {topCategories.map((category) => (
                    <li key={category.name} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2 text-sm">
                          <Dot color={category.color} />
                          <span className="truncate">{category.name}</span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="money text-sm font-medium">
                            {money(category.total)}
                          </span>
                          <span className="text-xs text-[var(--color-text-faint)]">
                            {percent(category.total, current.expense)}
                          </span>
                        </span>
                      </div>
                      <RankBar
                        value={category.total}
                        total={topCategories[0].total}
                        color={category.color}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card px-4 py-5">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold">Fixos do mês</h2>
                {fixed.length > 0 && (
                  <span className="money text-sm text-[var(--color-text-dim)]">
                    {money(fixedTotal)}
                  </span>
                )}
              </div>

              {fixed.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
                  Nenhum gasto fixo neste mês.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {fixed.map((occurrence) => (
                    <li
                      key={`${occurrence.expense_id}-${occurrence.month}`}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                        <span className="truncate text-sm">
                          {occurrence.description}
                        </span>
                        <Tag>
                          {occurrence.kind === "fixed_installment"
                            ? `parcela ${occurrence.installment_number} de ${occurrence.installments_total}`
                            : EXPENSE_KIND_LABEL.fixed_recurring}
                        </Tag>
                      </span>
                      <span className="money shrink-0 text-sm font-medium">
                        {money(occurrence.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="text-center text-xs text-[var(--color-text-faint)]">
            {scope === "us"
              ? "Somando as duas contas."
              : "Só os seus lançamentos."}{" "}
            <Link href="/relatorios" className="underline">
              Ver o ano inteiro
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
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
