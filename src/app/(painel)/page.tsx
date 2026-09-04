"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { ScopeHeading } from "@/components/ScopeHeading";
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
  formatDate,
  money,
  monthLabel,
  percent,
  toISODate,
} from "@/lib/format";
import { carregarJanela, JANELA_VAZIA, type TotaisDaJanela } from "@/lib/janela";
import {
  EXPENSE_KIND_LABEL,
  type Card,
  type Category,
  type CycleBounds,
  type ExpenseOccurrence,
  type MonthlySummaryRow,
} from "@/lib/types";

type Periodo = "mes" | "cartao";

/** Um dia antes ou depois da janela cai no ciclo vizinho. */
function shiftDay(iso: string, days: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, userIds, scope } = useScope();

  const [periodo, setPeriodo] = useState<Periodo>("mes");

  // --- mês do calendário ---
  const [month, setMonth] = useState(() =>
    firstDayOfMonth(toISODate(new Date()))
  );
  const [summary, setSummary] = useState<MonthlySummaryRow[]>([]);
  const [occurrences, setOccurrences] = useState<ExpenseOccurrence[]>([]);

  // --- janela do cartão ---
  const [cards, setCards] = useState<Card[]>([]);
  const [reference, setReference] = useState(() => toISODate(new Date()));
  const [bounds, setBounds] = useState<CycleBounds | null>(null);
  const [janela, setJanela] = useState<TotaisDaJanela>(JANELA_VAZIA);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** O cartão que define o mês; sem escolha, o primeiro com fechamento. */
  const cartaoDoMes = useMemo(
    () =>
      cards.find((card) => card.id === me.anchor_card_id && card.closing_day) ??
      cards.find((card) => card.closing_day) ??
      null,
    [cards, me.anchor_card_id]
  );

  // Cartões e categorias mudam pouco; carregam uma vez.
  useEffect(() => {
    (async () => {
      const [cardsResult, categoriesResult] = await Promise.all([
        supabase
          .from("cards")
          .select("*")
          .eq("user_id", me.id)
          .eq("archived", false)
          .order("name"),
        supabase.from("categories").select("*"),
      ]);
      setCards((cardsResult.data ?? []) as Card[]);
      setCategories((categoriesResult.data ?? []) as Category[]);
    })();
  }, [supabase, me.id]);

  const carregarMes = useCallback(async () => {
    setLoading(true);

    // Seis meses até o mês visto, para o gráfico e o número do mês saírem
    // da mesma consulta.
    const from = addMonths(month, -5);

    const [summaryResult, occurrencesResult] = await Promise.all([
      supabase.rpc("monthly_summary", { p_from: from, p_to: month }),
      supabase.rpc("expense_occurrences", { p_from: month, p_to: month }),
    ]);

    if (summaryResult.error || occurrencesResult.error) {
      setError("Não deu para carregar o resumo do mês.");
      setLoading(false);
      return;
    }

    setError(null);
    setSummary(summaryResult.data as MonthlySummaryRow[]);
    setOccurrences(occurrencesResult.data as ExpenseOccurrence[]);
    setLoading(false);
  }, [supabase, month]);

  const carregarCartao = useCallback(async () => {
    if (!cartaoDoMes) return;
    setLoading(true);

    const { data, error: boundsError } = await supabase.rpc(
      "card_cycle_bounds",
      { p_card_id: cartaoDoMes.id, p_reference_date: reference }
    );

    if (boundsError) {
      setError("Não deu para calcular a janela do cartão.");
      setLoading(false);
      return;
    }

    const limites = ((data ?? []) as CycleBounds[])[0] ?? null;
    setBounds(limites);
    try {
      setJanela(
        limites
          ? await carregarJanela(
              supabase,
              limites.cycle_start,
              limites.cycle_end,
              userIds
            )
          : JANELA_VAZIA
      );
    } catch {
      setJanela(JANELA_VAZIA);
      setError(
        "Não deu para somar a janela do cartão. Se o app acabou de ser atualizado, a migração do banco pode não ter rodado ainda."
      );
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(false);
  }, [supabase, cartaoDoMes, reference, userIds]);

  useEffect(() => {
    if (periodo === "mes") carregarMes();
    else carregarCartao();
  }, [periodo, carregarMes, carregarCartao]);

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

  const categoryById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of categories) map[category.id] = category;
    return map;
  }, [categories]);

  const doMes = series[series.length - 1] ?? {
    income: 0,
    expense: 0,
    investment: 0,
  };

  /**
   * Os quatro números e as duas listas saem daqui, venham do mês ou da
   * janela do cartão. Assim o resto da tela não precisa saber qual é.
   */
  const vista = useMemo(() => {
    if (periodo === "cartao") {
      return {
        income: janela.income,
        expense: janela.card + janela.other,
        investment: janela.investment,
        leftover: janela.leftover,
        gastos: janela.expenses.map((linha) => ({
          chave: `${linha.expense_id}-${linha.occurred_on}`,
          descricao: linha.description,
          valor: Number(linha.amount),
          categoria: linha.category_id,
          kind: linha.kind,
          parcela: linha.installment_number,
          parcelas: linha.installments_total,
        })),
      };
    }

    const noEscopo = occurrences.filter((o) => userIds.includes(o.user_id));
    return {
      income: doMes.income,
      expense: doMes.expense,
      investment: doMes.investment,
      leftover: doMes.income - doMes.expense - doMes.investment,
      gastos: noEscopo.map((o) => ({
        chave: `${o.expense_id}-${o.month}`,
        descricao: o.description,
        valor: Number(o.amount),
        categoria: o.category_id,
        kind: o.kind,
        parcela: o.installment_number,
        parcelas: o.installments_total,
      })),
    };
  }, [periodo, janela, occurrences, userIds, doMes]);

  /** Top 5 do período, somando por NOME — igual ao ranking do relatório. */
  const topCategories = useMemo(() => {
    const totals: Record<string, { total: number; color: string }> = {};

    for (const gasto of vista.gastos) {
      const category = categoryById[gasto.categoria ?? ""];
      const name = category?.name ?? "Sem categoria";
      if (!totals[name])
        totals[name] = { total: 0, color: category?.color ?? "#8B93A7" };
      totals[name].total += gasto.valor;
    }

    return Object.entries(totals)
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [vista.gastos, categoryById]);

  const fixed = useMemo(
    () =>
      vista.gastos
        .filter((gasto) => gasto.kind !== "variable")
        .sort((a, b) => b.valor - a.valor),
    [vista.gastos]
  );

  const fixedTotal = fixed.reduce((sum, gasto) => sum + gasto.valor, 0);

  const rotuloPeriodo =
    periodo === "cartao" && bounds
      ? `${formatDate(bounds.cycle_start)} a ${formatDate(bounds.cycle_end)}`
      : monthLabel(month);

  return (
    <div className="flex flex-col gap-6">
      <ScopeHeading />

      {/* Quem tem cartão com fechamento pode ler o mesmo dinheiro por duas
          réguas: o calendário ou o ciclo da fatura. */}
      {cartaoDoMes && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1">
            {(
              [
                { value: "mes" as Periodo, label: "Mês" },
                { value: "cartao" as Periodo, label: `Pelo ${cartaoDoMes.name}` },
              ]
            ).map((opcao) => (
              <button
                key={opcao.value}
                type="button"
                aria-pressed={periodo === opcao.value}
                onClick={() => setPeriodo(opcao.value)}
                className={[
                  "flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                  periodo === opcao.value
                    ? "bg-[var(--scope)] text-[var(--color-ink)]"
                    : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                ].join(" ")}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {periodo === "mes" ? (
          <MonthNav month={month} onChange={setMonth} />
        ) : (
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1">
            <button
              type="button"
              aria-label="Ciclo anterior"
              onClick={() =>
                bounds && setReference(shiftDay(bounds.cycle_start, -1))
              }
              className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              &lsaquo;
            </button>
            <span className="min-w-[12rem] text-center text-sm font-medium">
              {rotuloPeriodo}
            </span>
            <button
              type="button"
              aria-label="Próximo ciclo"
              onClick={() =>
                bounds && setReference(shiftDay(bounds.cycle_end, 1))
              }
              className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              &rsaquo;
            </button>
          </div>
        )}

        <Link href="/gastos">
          <Button>Novo gasto</Button>
        </Link>
      </div>

      {periodo === "cartao" && bounds?.due_date && (
        <p className="-mt-3 text-xs text-[var(--color-text-faint)]">
          A fatura deste ciclo é paga em {formatDate(bounds.due_date)}. Ela já
          está descontada aqui, porque o dinheiro fica comprometido no
          fechamento.{" "}
          <Link href="/relatorios/ciclo" className="underline">
            Ver a fatura
          </Link>
        </p>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Entrou" value={vista.income} tone="var(--color-in)" />
            <Stat
              label="Saiu"
              value={vista.expense}
              tone="var(--color-out)"
              hint={
                periodo === "cartao"
                  ? `cartão ${money(janela.card)} · fora ${money(janela.other)}`
                  : undefined
              }
            />
            <Stat
              label="Investiu"
              value={vista.investment}
              tone="var(--color-invest)"
            />
            <Stat
              label="Sobrou"
              value={vista.leftover}
              tone={
                vista.leftover < 0 ? "var(--color-out)" : "var(--color-text)"
              }
              hint={
                vista.leftover < 0
                  ? "Gastou mais do que entrou."
                  : "Depois de gastos e aportes."
              }
            />
          </div>

          {/* O gráfico é mês a mês por natureza: não faz sentido em janela. */}
          {periodo === "mes" && (
            <section className="card px-4 py-5">
              <h2 className="mb-1 text-sm font-semibold">Últimos 6 meses</h2>
              <p className="mb-3 text-xs text-[var(--color-text-faint)]">
                O que entrou contra o que saiu, mês a mês.
              </p>
              <MonthlyBars data={series} series={["income", "expense"]} />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card px-4 py-5">
              <h2 className="mb-3 text-sm font-semibold">
                Onde foi o dinheiro
              </h2>
              {topCategories.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
                  Nenhum gasto em {rotuloPeriodo}.
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
                            {percent(category.total, vista.expense)}
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
                <h2 className="text-sm font-semibold">
                  {periodo === "cartao" ? "Fixos do ciclo" : "Fixos do mês"}
                </h2>
                {fixed.length > 0 && (
                  <span className="money text-sm text-[var(--color-text-dim)]">
                    {money(fixedTotal)}
                  </span>
                )}
              </div>

              {fixed.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
                  Nenhum gasto fixo neste período.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {fixed.map((gasto) => (
                    <li
                      key={gasto.chave}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
                        <span className="truncate text-sm">
                          {gasto.descricao}
                        </span>
                        <Tag>
                          {gasto.kind === "fixed_installment"
                            ? `parcela ${gasto.parcela} de ${gasto.parcelas}`
                            : EXPENSE_KIND_LABEL.fixed_recurring}
                        </Tag>
                      </span>
                      <span className="money shrink-0 text-sm font-medium">
                        {money(gasto.valor)}
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
