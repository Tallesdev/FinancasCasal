"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { carregarJanela, JANELA_VAZIA, type TotaisDaJanela } from "@/lib/janela";
import {
  EXPENSE_KIND_LABEL,
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
  const router = useRouter();
  const { me } = useScope();

  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState("");
  const [anchorId, setAnchorId] = useState<string | null>(
    me.anchor_card_id ?? null
  );
  const [reference, setReference] = useState(() => toISODate(new Date()));

  const [bounds, setBounds] = useState<CycleBounds | null>(null);
  const [summary, setSummary] = useState<CycleSummaryRow | null>(null);
  const [ranking, setRanking] = useState<CycleCategoryRow[]>([]);
  const [rows, setRows] = useState<CycleExpenseRow[]>([]);
  const [janela, setJanela] = useState<TotaisDaJanela>(JANELA_VAZIA);
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
        // Abre no cartão que define o mês; senão, no primeiro com fechamento.
        const preferido =
          list.find((card) => card.id === me.anchor_card_id) ??
          list.find((card) => card.closing_day) ??
          list[0];
        setCardId(preferido?.id ?? "");
      }
      setCategories((categoriesResult.data ?? []) as Category[]);
      setLoadingCards(false);
    })();
  }, [supabase, me.id, me.anchor_card_id]);

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

    const limites = ((boundsResult.data ?? []) as CycleBounds[])[0] ?? null;
    setBounds(limites);
    setSummary(((summaryResult.data ?? []) as CycleSummaryRow[])[0] ?? null);
    setRanking((rankingResult.data ?? []) as CycleCategoryRow[]);
    setRows((detailResult.data ?? []) as CycleExpenseRow[]);

    // Renda, gasto e aporte da janela precisam de projeção por dia: a
    // janela vai do 14 ao 13, então o resumo mensal não serve. A fatura é
    // só deste cartão, mas a sobra desconta tudo que saiu.
    try {
      setJanela(
        limites
          ? await carregarJanela(
              supabase,
              limites.cycle_start,
              limites.cycle_end,
              [me.id]
            )
          : JANELA_VAZIA
      );
    } catch {
      setJanela(JANELA_VAZIA);
      setError(
        "Não deu para somar a janela. Se o app acabou de ser atualizado, a migração do banco pode não ter rodado ainda."
      );
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(false);
  }, [supabase, cardId, reference, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of categories) map[category.id] = category;
    return map;
  }, [categories]);

  async function setAnchor(id: string | null) {
    setAnchorId(id);
    await supabase
      .from("profiles")
      .update({ anchor_card_id: id })
      .eq("id", me.id);
    // O layout lê o perfil no servidor; sem isso o dashboard fica atrasado.
    router.refresh();
  }

  const fatura = Number(summary?.total ?? 0);
  const saiu = janela.card + janela.other;

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Pelo cartão"
        description="Quando o seu mês é definido pelo fechamento da fatura, não pelo calendário."
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
          Pelo cartão
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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {cards.map((card) => {
                const ativo = card.id === cardId;
                return (
                  <button
                    key={card.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => {
                      setCardId(card.id);
                      setReference(toISODate(new Date()));
                    }}
                    className={[
                      "flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                      ativo
                        ? "border-[var(--scope)] bg-[var(--scope)]/10 text-[var(--color-text)]"
                        : "border-[var(--color-line)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                    ].join(" ")}
                  >
                    <Dot color={card.color} />
                    {card.name}
                    {card.closing_day && (
                      <span className="text-[var(--color-text-faint)]">
                        fecha {card.closing_day}
                      </span>
                    )}
                    {card.id === anchorId && (
                      <span
                        aria-label="define o seu mês"
                        title="Define o seu mês"
                        className="scope-tint"
                      >
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* O cartão âncora é o que o dashboard usa pra avisar do
                fechamento. Quem recebe salário fixo não precisa de nenhum. */}
            {selected?.closing_day &&
              (selected.id === anchorId ? (
                <p className="text-xs text-[var(--color-text-faint)]">
                  ★ Este cartão define o seu mês.{" "}
                  <button
                    type="button"
                    onClick={() => setAnchor(null)}
                    className="underline hover:text-[var(--color-text)]"
                  >
                    Voltar para o mês do calendário
                  </button>
                </p>
              ) : (
                <p className="text-xs text-[var(--color-text-faint)]">
                  <button
                    type="button"
                    onClick={() => setAnchor(selected.id)}
                    className="underline hover:text-[var(--color-text)]"
                  >
                    Usar este cartão para definir o meu mês
                  </button>{" "}
                  — o resumo do fechamento passa a aparecer no início.
                </p>
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
                      ? `Você paga em ${formatDate(bounds.due_date)}`
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

              <Numero
                label={`Fatura fechada${selected ? ` · ${selected.name}` : ""}`}
                value={fatura}
                tone="var(--color-out)"
                destaque
                hint={
                  bounds.due_date
                    ? `Você paga em ${formatDate(bounds.due_date)}`
                    : undefined
                }
              />

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Numero
                  label="Entrou"
                  value={janela.income}
                  tone="var(--color-in)"
                />
                <Numero
                  label="Saiu"
                  value={saiu}
                  tone="var(--color-out)"
                  hint={`cartão ${money(janela.card)} · fora ${money(
                    janela.other
                  )}`}
                />
                <Numero
                  label="Investiu"
                  value={janela.investment}
                  tone="var(--color-invest)"
                />
                <Numero
                  label="Sobrou"
                  value={janela.leftover}
                  tone={
                    janela.leftover < 0
                      ? "var(--color-out)"
                      : "var(--color-text)"
                  }
                  hint="entrou menos tudo que saiu"
                />
              </div>

              <p className="text-xs text-[var(--color-text-faint)]">
                A fatura já está comprometida no momento em que fecha, mesmo que
                só saia da conta no vencimento — por isso ela entra no
                &ldquo;saiu&rdquo; desta janela, junto com o Pix e as
                transferências do mesmo período. A lista abaixo mostra só as
                compras do cartão; o resto está no{" "}
                <Link href="/relatorios" className="underline">
                  mês a mês
                </Link>
                .
              </p>

              {rows.length === 0 ? (
                <EmptyState
                  title="Nada nesta fatura"
                  description="Nenhuma compra no cartão caiu nesta janela. Use as setas para ver outro ciclo."
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
                                {percent(Number(row.total), fatura)}
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
                      Compras desta fatura
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
            </>
          )}
        </>
      )}
    </div>
  );
}

function Numero({
  label,
  value,
  tone,
  hint,
  destaque,
}: {
  label: string;
  value: number;
  tone: string;
  hint?: string;
  destaque?: boolean;
}) {
  return (
    <div className="card flex flex-col gap-1 px-4 py-4">
      <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
        {label}
      </span>
      <strong
        style={{ color: tone }}
        className={[
          "money font-semibold",
          destaque ? "text-2xl" : "text-xl",
        ].join(" ")}
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
