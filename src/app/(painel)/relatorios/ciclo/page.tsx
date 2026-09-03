"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { RankBar } from "@/components/charts";
import {
  Button,
  Dot,
  EmptyState,
  ErrorNote,
  Loading,
  PageTitle,
  Tag,
} from "@/components/ui";
import { formatDate, money, percent, toISODate } from "@/lib/format";
import {
  EXPENSE_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  type Card,
  type Category,
  type CycleBounds,
  type CycleCategoryRow,
  type CycleExpenseRow,
  type CycleSummaryRow,
} from "@/lib/types";

/** Um dia antes ou depois da janela cai no ciclo vizinho. */
function shiftDay(iso: string, days: number) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
}

export default function CicloPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me } = useScope();

  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState("");
  const [reference, setReference] = useState(() => toISODate(new Date()));

  const [bounds, setBounds] = useState<CycleBounds | null>(null);
  const [summary, setSummary] = useState<CycleSummaryRow | null>(null);
  const [ranking, setRanking] = useState<CycleCategoryRow[]>([]);
  const [rows, setRows] = useState<CycleExpenseRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loadingCards, setLoadingCards] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cartão é privado: a RLS já devolve só os meus.
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

      if (cardsResult.error) {
        setError("Não deu para carregar seus cartões.");
      } else {
        const list = (cardsResult.data ?? []) as Card[];
        setCards(list);
        // Começa pelo primeiro cartão que tem fechamento cadastrado.
        setCardId(
          (list.find((card) => card.closing_day) ?? list[0])?.id ?? ""
        );
      }
      setCategories((categoriesResult.data ?? []) as Category[]);
      setLoadingCards(false);
    })();
  }, [supabase, me.id]);

  const selected = cards.find((card) => card.id === cardId) ?? null;

  const load = useCallback(async () => {
    if (!cardId) return;
    setLoading(true);

    const args = { p_card_id: cardId, p_reference_date: reference };

    const [boundsResult, summaryResult, rankingResult, detailResult] =
      await Promise.all([
        supabase.rpc("card_cycle_bounds", args),
        supabase.rpc("cycle_summary", args),
        supabase.rpc("cycle_category_ranking", args),
        supabase.rpc("cycle_expense_detail", args),
      ]);

    if (boundsResult.error) {
      setError(
        "Não deu para calcular o ciclo. Se o app acabou de ser atualizado, a migração do banco pode não ter rodado ainda."
      );
      setLoading(false);
      return;
    }

    setError(null);
    setBounds(((boundsResult.data ?? []) as CycleBounds[])[0] ?? null);
    setSummary(((summaryResult.data ?? []) as CycleSummaryRow[])[0] ?? null);
    setRanking((rankingResult.data ?? []) as CycleCategoryRow[]);
    setRows((detailResult.data ?? []) as CycleExpenseRow[]);
    setLoading(false);
  }, [supabase, cardId, reference]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of categories) map[category.id] = category;
    return map;
  }, [categories]);

  const total = Number(summary?.total ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Fatura por ciclo"
        description="O que você vai pagar de fato, seguindo o fechamento do cartão."
      />

      <nav className="flex gap-2" aria-label="Tipo de relatório">
        <Link
          href="/relatorios"
          className="rounded-full border border-[var(--color-line)] px-3.5 py-1.5 text-sm text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)]"
        >
          Mês a mês
        </Link>
        <span
          aria-current="page"
          className="rounded-full bg-[var(--scope)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-ink)]"
        >
          Por ciclo
        </span>
      </nav>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loadingCards ? (
        <Loading />
      ) : cards.length === 0 ? (
        <EmptyState
          title="Nenhum cartão cadastrado"
          description="O ciclo é sempre de um cartão específico. Cadastre um para começar."
          action={
            <Link href="/cartoes">
              <Button>Cadastrar cartão</Button>
            </Link>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                aria-pressed={card.id === cardId}
                onClick={() => {
                  setCardId(card.id);
                  setReference(toISODate(new Date()));
                }}
                className={[
                  "flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  card.id === cardId
                    ? "border-[var(--scope)] bg-[var(--scope)]/10 text-[var(--color-text)]"
                    : "border-[var(--color-line)] text-[var(--color-text-dim)]",
                ].join(" ")}
              >
                <Dot color={card.color} />
                {card.name}
              </button>
            ))}
          </div>

          {/* Sem dia de fechamento não existe janela pra calcular. */}
          {selected && !selected.closing_day ? (
            <EmptyState
              title={`"${selected.name}" não tem dia de fechamento`}
              description="O ciclo é calculado a partir dele. Cadastre o fechamento do cartão e este relatório passa a funcionar."
              action={
                <Link href="/cartoes">
                  <Button>Editar cartão</Button>
                </Link>
              }
            />
          ) : loading ? (
            <Loading />
          ) : !bounds ? (
            <Loading label="Calculando o ciclo…" />
          ) : (
            <>
              <div className="card flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                <Button
                  variant="ghost"
                  onClick={() => setReference(shiftDay(bounds.cycle_start, -1))}
                >
                  &lsaquo; Anterior
                </Button>

                <div className="text-center">
                  <p className="font-semibold">
                    {formatDate(bounds.cycle_start)} a{" "}
                    {formatDate(bounds.cycle_end)}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
                    {bounds.due_date
                      ? `Vence em ${formatDate(bounds.due_date)}`
                      : "Sem dia de vencimento cadastrado"}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  onClick={() => setReference(shiftDay(bounds.cycle_end, 1))}
                >
                  Próximo &rsaquo;
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Total label="Total da fatura" value={total} strong />
                <Total
                  label="No cartão"
                  value={Number(summary?.total_card ?? 0)}
                />
                <Total
                  label="Pix da conta"
                  value={Number(summary?.total_pix ?? 0)}
                />
              </div>

              {rows.length === 0 ? (
                <EmptyState
                  title="Nada nesta fatura"
                  description="Nenhum lançamento caiu nesta janela. Use as setas para ver outro ciclo."
                />
              ) : (
                <>
                  <section className="card px-4 py-5">
                    <h2 className="mb-3 text-sm font-semibold">
                      Onde foi o dinheiro
                    </h2>
                    <ul className="flex flex-col gap-3">
                      {ranking.map((row) => (
                        <li
                          key={row.category_name}
                          className="flex flex-col gap-1.5"
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2 text-sm">
                              <Dot color={row.color} />
                              <span className="truncate">
                                {row.category_name}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-baseline gap-2">
                              <span className="money text-sm font-medium">
                                {money(row.total)}
                              </span>
                              <span className="text-xs text-[var(--color-text-faint)]">
                                {percent(Number(row.total), total)}
                              </span>
                            </span>
                          </div>
                          <RankBar
                            value={Number(row.total)}
                            total={Number(ranking[0].total)}
                            color={row.color}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold">
                      Lançamentos do ciclo
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {rows.map((row) => {
                        const category = categoryById[row.category_id ?? ""];
                        return (
                          <li
                            key={`${row.expense_id}-${row.occurred_on}`}
                            className="card flex items-start justify-between gap-3 px-4 py-3"
                          >
                            <div className="flex min-w-0 items-start gap-2.5">
                              <span className="mt-1.5">
                                <Dot color={category?.color ?? null} />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-medium">
                                  {row.description}
                                </p>
                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                                  <span>{formatDate(row.occurred_on)}</span>
                                  {category && <span>{category.name}</span>}
                                  <Tag>
                                    {PAYMENT_METHOD_LABEL[row.payment_method]}
                                  </Tag>
                                  {row.kind !== "variable" && (
                                    <Tag>
                                      {row.kind === "fixed_installment"
                                        ? `parcela ${row.installment_number} de ${row.installments_total}`
                                        : EXPENSE_KIND_LABEL.fixed_recurring}
                                    </Tag>
                                  )}
                                </p>
                              </div>
                            </div>
                            <span className="money shrink-0 font-semibold">
                              {money(row.amount)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                </>
              )}

              {selected && !selected.bank_account_id && (
                <p className="text-center text-xs text-[var(--color-text-faint)]">
                  Este cartão não está ligado a nenhuma conta, então nenhum Pix
                  entra na fatura dele.{" "}
                  <Link href="/cartoes" className="underline">
                    Ligar a uma conta
                  </Link>
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Total({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div className="card flex flex-col gap-1 px-4 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
        {label}
      </span>
      <strong
        className={[
          "money font-semibold",
          strong ? "text-xl text-[var(--color-out)] sm:text-2xl" : "text-lg",
        ].join(" ")}
      >
        {money(value)}
      </strong>
    </div>
  );
}
