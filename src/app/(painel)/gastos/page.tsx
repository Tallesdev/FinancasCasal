"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import {
  Button,
  DeleteButton,
  Dot,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  MonthNav,
  OwnerTag,
  PageTitle,
  Sheet,
  Tag,
  inputClass,
} from "@/components/ui";
import {
  addMonths,
  firstDayOfMonth,
  formatDate,
  money,
  monthLabel,
  toISODate,
} from "@/lib/format";
import {
  EXPENSE_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  type Card,
  type Category,
  type Expense,
  type ExpenseKind,
  type ExpenseOccurrence,
  type PaymentMethod,
} from "@/lib/types";

type Draft = {
  id: string | null;
  description: string;
  amount: string;
  payment_method: PaymentMethod;
  kind: ExpenseKind;
  card_id: string;
  category_id: string;
  start_date: string;
  end_date: string;
  installments_total: string;
  notes: string;
};

function emptyDraft(month: string): Draft {
  const today = toISODate(new Date());
  // Se o usuário está olhando outro mês, o gasto novo nasce naquele mês.
  const sameMonth = today.slice(0, 7) === month.slice(0, 7);

  return {
    id: null,
    description: "",
    amount: "",
    payment_method: "pix",
    kind: "variable",
    card_id: "",
    category_id: "",
    start_date: sameMonth ? today : month,
    end_date: "",
    installments_total: "",
    notes: "",
  };
}

export default function GastosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, partner, userIds, scope } = useScope();

  const [month, setMonth] = useState(() =>
    firstDayOfMonth(toISODate(new Date()))
  );
  const [occurrences, setOccurrences] = useState<ExpenseOccurrence[]>([]);
  const [expenses, setExpenses] = useState<Record<string, Expense>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Filtros da lista
  const [filterMethod, setFilterMethod] = useState<"" | PaymentMethod>("");
  const [filterKind, setFilterKind] = useState<"" | ExpenseKind>("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterCard, setFilterCard] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    const [occurrencesResult, expensesResult, categoriesResult, cardsResult] =
      await Promise.all([
        // A lista do mês vem da projeção, não da tabela crua: assim os fixos
        // aparecem no mês certo e o parcelado sabe que parcela é.
        supabase.rpc("expense_occurrences", { p_from: month, p_to: month }),
        supabase.from("expenses").select("*"),
        supabase.from("categories").select("*"),
        // Cartão é privado, então só os meus voltam de qualquer jeito.
        supabase.from("cards").select("*").eq("user_id", me.id),
      ]);

    if (occurrencesResult.error) {
      setError("Não deu para carregar os gastos do mês.");
      setLoading(false);
      return;
    }

    setError(null);
    setOccurrences(occurrencesResult.data as ExpenseOccurrence[]);

    const byId: Record<string, Expense> = {};
    for (const row of (expensesResult.data ?? []) as Expense[]) byId[row.id] = row;
    setExpenses(byId);

    setCategories((categoriesResult.data ?? []) as Category[]);
    setCards((cardsResult.data ?? []) as Card[]);
    setLoading(false);
  }, [supabase, month, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  const categoryById = useMemo(() => {
    const map: Record<string, Category> = {};
    for (const category of categories) map[category.id] = category;
    return map;
  }, [categories]);

  const cardById = useMemo(() => {
    const map: Record<string, Card> = {};
    for (const card of cards) map[card.id] = card;
    return map;
  }, [cards]);

  const profileById = useMemo(() => {
    const map: Record<string, { name: string; accent: "a" | "b" }> = {
      [me.id]: { name: me.display_name, accent: me.accent },
    };
    if (partner)
      map[partner.id] = { name: partner.display_name, accent: partner.accent };
    return map;
  }, [me, partner]);

  /** Categorias que aparecem no filtro: as da casa, sem repetir nome. */
  const filterCategories = useMemo(() => {
    const seen = new Set<string>();
    return categories
      .filter((category) => userIds.includes(category.user_id))
      .filter((category) => {
        if (seen.has(category.name)) return false;
        seen.add(category.name);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [categories, userIds]);

  /** Nos formulários, só as minhas categorias e os meus cartões. */
  const myCategories = useMemo(
    () =>
      categories
        .filter((category) => category.user_id === me.id && !category.archived)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [categories, me.id]
  );

  const myCards = useMemo(
    () => cards.filter((card) => !card.archived),
    [cards]
  );

  const visible = useMemo(() => {
    const list = occurrences
      .filter((occurrence) => userIds.includes(occurrence.user_id))
      .filter((o) => !filterMethod || o.payment_method === filterMethod)
      .filter((o) => !filterKind || o.kind === filterKind)
      .filter((o) => {
        if (!filterCategory) return true;
        return categoryById[o.category_id ?? ""]?.name === filterCategory;
      })
      .filter((o) => !filterCard || o.card_id === filterCard);

    // Ordem cronológica dentro do mês: usa o dia da linha original.
    const dayOf = (occurrence: ExpenseOccurrence) =>
      expenses[occurrence.expense_id]?.start_date.slice(8, 10) ?? "01";

    return list.sort((a, b) => {
      const diff = dayOf(b).localeCompare(dayOf(a));
      return diff !== 0 ? diff : b.amount - a.amount;
    });
  }, [
    occurrences,
    userIds,
    filterMethod,
    filterKind,
    filterCategory,
    filterCard,
    categoryById,
    expenses,
  ]);

  const total = visible.reduce((sum, o) => sum + Number(o.amount), 0);
  const hasFilters = Boolean(
    filterMethod || filterKind || filterCategory || filterCard
  );

  function openEdit(occurrence: ExpenseOccurrence) {
    const expense = expenses[occurrence.expense_id];
    if (!expense) return;

    setDraft({
      id: expense.id,
      description: expense.description,
      amount: String(expense.amount),
      payment_method: expense.payment_method,
      kind: expense.kind,
      card_id: expense.card_id ?? "",
      category_id: expense.category_id ?? "",
      start_date: expense.start_date.slice(0, 10),
      end_date: expense.end_date?.slice(0, 10) ?? "",
      installments_total: expense.installments_total?.toString() ?? "",
      notes: expense.notes ?? "",
    });
    setFormError(null);
  }

  async function save() {
    if (!draft) return;

    const description = draft.description.trim();
    const amount = Number(draft.amount.replace(",", "."));

    if (!description) return setFormError("Escreva o que foi o gasto.");
    if (!Number.isFinite(amount) || amount <= 0)
      return setFormError("Informe um valor maior que zero.");
    if (!draft.start_date) return setFormError("Escolha a data.");
    if (draft.payment_method === "card" && !draft.card_id)
      return setFormError("Escolha o cartão.");

    const installments = Number(draft.installments_total);
    if (draft.kind === "fixed_installment" && (!installments || installments < 2))
      return setFormError("Parcelado precisa de pelo menos 2 parcelas.");
    if (
      draft.kind === "fixed_recurring" &&
      draft.end_date &&
      draft.end_date < draft.start_date
    )
      return setFormError("O fim não pode ser antes do começo.");

    // O formato de cada tipo precisa bater com as constraints do banco.
    const payload = {
      description,
      amount,
      payment_method: draft.payment_method,
      kind: draft.kind,
      card_id: draft.payment_method === "card" ? draft.card_id : null,
      category_id: draft.category_id || null,
      start_date: draft.start_date,
      end_date:
        draft.kind === "fixed_recurring" && draft.end_date
          ? draft.end_date
          : null,
      installments_total:
        draft.kind === "fixed_installment" ? installments : null,
      notes: draft.notes.trim() || null,
    };

    setSaving(true);
    setFormError(null);

    const { error: writeError } = draft.id
      ? await supabase.from("expenses").update(payload).eq("id", draft.id)
      : await supabase.from("expenses").insert(payload);

    setSaving(false);

    if (writeError) {
      setFormError("Não deu para salvar o gasto. Confira os campos.");
      return;
    }

    setDraft(null);
    load();
  }

  async function remove(id: string) {
    await supabase.from("expenses").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Gastos"
        description={
          scope === "us"
            ? "Tudo que os dois gastaram no mês."
            : "Tudo que passou pela sua conta no mês."
        }
        action={
          <Button onClick={() => setDraft(emptyDraft(month))}>Novo gasto</Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={setMonth} />
        <p className="text-sm text-[var(--color-text-dim)]">
          Total do mês{" "}
          <strong className="money text-base text-[var(--color-out)]">
            {money(total)}
          </strong>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Forma de pagamento"
          className={`${inputClass} w-auto py-2 sm:text-sm`}
          value={filterMethod}
          onChange={(event) =>
            setFilterMethod(event.target.value as "" | PaymentMethod)
          }
        >
          <option value="">Toda forma</option>
          <option value="pix">Pix</option>
          <option value="card">Cartão</option>
        </select>

        <select
          aria-label="Tipo de gasto"
          className={`${inputClass} w-auto py-2 sm:text-sm`}
          value={filterKind}
          onChange={(event) =>
            setFilterKind(event.target.value as "" | ExpenseKind)
          }
        >
          <option value="">Todo tipo</option>
          <option value="variable">Variável</option>
          <option value="fixed_recurring">Fixo mensal</option>
          <option value="fixed_installment">Parcelado</option>
        </select>

        <select
          aria-label="Categoria"
          className={`${inputClass} w-auto py-2 sm:text-sm`}
          value={filterCategory}
          onChange={(event) => setFilterCategory(event.target.value)}
        >
          <option value="">Toda categoria</option>
          {filterCategories.map((category) => (
            <option key={category.id} value={category.name}>
              {category.name}
            </option>
          ))}
        </select>

        {myCards.length > 0 && (
          <select
            aria-label="Cartão"
            className={`${inputClass} w-auto py-2 sm:text-sm`}
            value={filterCard}
            onChange={(event) => setFilterCard(event.target.value)}
          >
            <option value="">Todo cartão</option>
            {myCards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        )}

        {hasFilters && (
          <Button
            variant="quiet"
            className="px-2 py-1 text-xs"
            onClick={() => {
              setFilterMethod("");
              setFilterKind("");
              setFilterCategory("");
              setFilterCard("");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          title={hasFilters ? "Nada com esses filtros" : "Nenhum gasto no mês"}
          description={
            hasFilters
              ? "Tente afrouxar os filtros ou mudar de mês."
              : `Lance o primeiro gasto de ${monthLabel(month)}.`
          }
          action={
            hasFilters ? undefined : (
              <Button onClick={() => setDraft(emptyDraft(month))}>
                Novo gasto
              </Button>
            )
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((occurrence) => {
            const expense = expenses[occurrence.expense_id];
            const category = categoryById[occurrence.category_id ?? ""];
            const card = cardById[occurrence.card_id ?? ""];
            const mine = occurrence.user_id === me.id;
            const owner = profileById[occurrence.user_id];

            return (
              <li
                key={`${occurrence.expense_id}-${occurrence.month}`}
                className="card flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-1.5">
                    <Dot color={category?.color ?? null} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {occurrence.description}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                      {category && <span>{category.name}</span>}
                      <Tag>
                        {occurrence.payment_method === "card"
                          ? card?.name ?? PAYMENT_METHOD_LABEL.card
                          : PAYMENT_METHOD_LABEL.pix}
                      </Tag>
                      {occurrence.kind !== "variable" && (
                        <Tag>
                          {occurrence.kind === "fixed_installment"
                            ? `parcela ${occurrence.installment_number} de ${occurrence.installments_total}`
                            : EXPENSE_KIND_LABEL.fixed_recurring}
                        </Tag>
                      )}
                      {occurrence.kind === "variable" && expense && (
                        <span>{formatDate(expense.start_date)}</span>
                      )}
                      {scope === "us" && owner && (
                        <OwnerTag name={owner.name} accent={owner.accent} />
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="money font-semibold">
                    {money(occurrence.amount)}
                  </span>
                  {/* Só mexe no que é seu. */}
                  {mine && (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="quiet"
                        className="px-2 py-0.5 text-xs"
                        onClick={() => openEdit(occurrence)}
                      >
                        Editar
                      </Button>
                      <DeleteButton
                        onConfirm={() => remove(occurrence.expense_id)}
                      />
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <Sheet
          title={draft.id ? "Editar gasto" : "Novo gasto"}
          onClose={() => setDraft(null)}
        >
          <ExpenseForm
            draft={draft}
            setDraft={setDraft}
            categories={myCategories}
            cards={myCards}
            error={formError}
            saving={saving}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

function ExpenseForm({
  draft,
  setDraft,
  categories,
  cards,
  error,
  saving,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  categories: Category[];
  cards: Card[];
  error: string | null;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const amount = Number(draft.amount.replace(",", "."));
  const installments = Number(draft.installments_total);

  // Prévia do parcelamento: quanto no total e em que mês termina.
  const preview =
    draft.kind === "fixed_installment" &&
    installments >= 2 &&
    Number.isFinite(amount) &&
    amount > 0 &&
    draft.start_date
      ? `${installments}x de ${money(amount)} — ${money(
          amount * installments
        )} no total, termina em ${monthLabel(
          addMonths(firstDayOfMonth(draft.start_date), installments - 1)
        )}`
      : null;

  const dateLabel =
    draft.kind === "variable"
      ? "Data do gasto"
      : draft.kind === "fixed_installment"
        ? "Primeira parcela"
        : "Começa em";

  return (
    <div className="flex flex-col gap-4">
      <Field label="O que foi">
        <input
          className={inputClass}
          value={draft.description}
          autoFocus
          placeholder="Mercado do mês, Netflix, sofá…"
          onChange={(event) => set({ description: event.target.value })}
        />
      </Field>

      <Field
        label="Valor"
        hint={
          draft.kind === "fixed_installment"
            ? "O valor de uma parcela, não o total."
            : draft.kind === "fixed_recurring"
              ? "O valor que se repete todo mês."
              : undefined
        }
      >
        <input
          className={`${inputClass} money`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={draft.amount}
          onChange={(event) => set({ amount: event.target.value })}
        />
      </Field>

      <Field label="Forma de pagamento">
        <div className="grid grid-cols-2 gap-2">
          {(["pix", "card"] as PaymentMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              aria-pressed={draft.payment_method === method}
              onClick={() =>
                set({
                  payment_method: method,
                  card_id: method === "card" ? draft.card_id : "",
                })
              }
              className={[
                "rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors",
                draft.payment_method === method
                  ? "border-[var(--scope)] bg-[var(--scope)]/10 text-[var(--color-text)]"
                  : "border-[var(--color-line)] text-[var(--color-text-dim)]",
              ].join(" ")}
            >
              {PAYMENT_METHOD_LABEL[method]}
            </button>
          ))}
        </div>
      </Field>

      {draft.payment_method === "card" && (
        <Field
          label="Cartão"
          hint={cards.length === 0 ? "Cadastre um cartão em Ajustes." : undefined}
        >
          <select
            className={inputClass}
            value={draft.card_id}
            onChange={(event) => set({ card_id: event.target.value })}
          >
            <option value="">Escolha o cartão</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Tipo">
        <div className="grid grid-cols-3 gap-2">
          {(
            ["variable", "fixed_recurring", "fixed_installment"] as ExpenseKind[]
          ).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={draft.kind === kind}
              onClick={() =>
                set({
                  kind,
                  end_date: kind === "fixed_recurring" ? draft.end_date : "",
                  installments_total:
                    kind === "fixed_installment" ? draft.installments_total : "",
                })
              }
              className={[
                "rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                draft.kind === kind
                  ? "border-[var(--scope)] bg-[var(--scope)]/10 text-[var(--color-text)]"
                  : "border-[var(--color-line)] text-[var(--color-text-dim)]",
              ].join(" ")}
            >
              {EXPENSE_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={dateLabel}>
          <input
            className={inputClass}
            type="date"
            value={draft.start_date}
            onChange={(event) => set({ start_date: event.target.value })}
          />
        </Field>

        {draft.kind === "fixed_recurring" && (
          <Field label="Termina em" hint="Deixe vazio se não tem fim previsto.">
            <input
              className={inputClass}
              type="date"
              value={draft.end_date}
              onChange={(event) => set({ end_date: event.target.value })}
            />
          </Field>
        )}

        {draft.kind === "fixed_installment" && (
          <Field label="Número de parcelas">
            <input
              className={inputClass}
              type="number"
              inputMode="numeric"
              min={2}
              placeholder="10"
              value={draft.installments_total}
              onChange={(event) =>
                set({ installments_total: event.target.value })
              }
            />
          </Field>
        )}
      </div>

      {preview && (
        <p className="rounded-lg border border-[var(--scope)]/30 bg-[var(--scope)]/10 px-3.5 py-2.5 text-sm">
          {preview}
        </p>
      )}

      <Field label="Categoria">
        <select
          className={inputClass}
          value={draft.category_id}
          onChange={(event) => set({ category_id: event.target.value })}
        >
          <option value="">Sem categoria</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Observação" hint="Opcional">
        <input
          className={inputClass}
          value={draft.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="mt-2 flex gap-2">
        <Button onClick={onSave} disabled={saving} className="flex-1">
          {saving ? "Salvando…" : "Salvar gasto"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
