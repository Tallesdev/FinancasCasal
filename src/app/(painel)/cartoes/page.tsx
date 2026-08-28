"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import {
  Button,
  ColorPicker,
  DeleteButton,
  Dot,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  PageTitle,
  Sheet,
  Tag,
  inputClass,
} from "@/components/ui";
import { DEFAULT_COLOR } from "@/lib/palette";
import type { Card } from "@/lib/types";

type Draft = {
  id: string | null;
  name: string;
  closing_day: string;
  due_day: string;
  color: string;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  closing_day: "",
  due_day: "",
  color: DEFAULT_COLOR,
};

export default function CartoesPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me } = useScope();

  const [cards, setCards] = useState<Card[]>([]);
  // Quantos gastos apontam para cada cartão — define se dá para excluir.
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // Cartão é privado: a RLS já devolve só os meus, mas o filtro deixa claro.
    const [cardsResult, expensesResult] = await Promise.all([
      supabase
        .from("cards")
        .select("*")
        .eq("user_id", me.id)
        .order("archived")
        .order("name"),
      supabase.from("expenses").select("card_id").eq("user_id", me.id),
    ]);

    if (cardsResult.error) {
      setError("Não deu para carregar seus cartões.");
    } else {
      setCards(cardsResult.data as Card[]);
      setError(null);
    }

    const counts: Record<string, number> = {};
    for (const row of expensesResult.data ?? []) {
      if (row.card_id) counts[row.card_id] = (counts[row.card_id] ?? 0) + 1;
    }
    setUsage(counts);

    setLoading(false);
  }, [supabase, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft) return;

    const name = draft.name.trim();
    if (!name) {
      setError("Dê um nome ao cartão.");
      return;
    }

    const day = (value: string) => {
      if (!value) return null;
      const n = Number(value);
      return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
    };

    setSaving(true);
    setError(null);

    // O user_id vem do default auth.uid() do banco — nunca mandamos daqui.
    const payload = {
      name,
      closing_day: day(draft.closing_day),
      due_day: day(draft.due_day),
      color: draft.color,
    };

    const { error: writeError } = draft.id
      ? await supabase.from("cards").update(payload).eq("id", draft.id)
      : await supabase.from("cards").insert(payload);

    setSaving(false);

    if (writeError) {
      setError("Não deu para salvar o cartão. Tente de novo.");
      return;
    }

    setDraft(null);
    load();
  }

  async function setArchived(card: Card, archived: boolean) {
    await supabase.from("cards").update({ archived }).eq("id", card.id);
    load();
  }

  async function remove(card: Card) {
    const { error: deleteError } = await supabase
      .from("cards")
      .delete()
      .eq("id", card.id);
    if (deleteError) {
      setError("Não deu para excluir. Arquive o cartão no lugar disso.");
      return;
    }
    load();
  }

  const active = cards.filter((card) => !card.archived);
  const archived = cards.filter((card) => card.archived);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Cartões"
        description="Seus cartões, só seus. A outra conta não enxerga esta lista."
        action={<Button onClick={() => setDraft(EMPTY)}>Novo cartão</Button>}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : active.length === 0 && archived.length === 0 ? (
        <EmptyState
          title="Nenhum cartão ainda"
          description="Cadastre um cartão para poder lançar gastos no crédito."
          action={<Button onClick={() => setDraft(EMPTY)}>Novo cartão</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-2">
            {active.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                uses={usage[card.id] ?? 0}
                onEdit={() =>
                  setDraft({
                    id: card.id,
                    name: card.name,
                    closing_day: card.closing_day?.toString() ?? "",
                    due_day: card.due_day?.toString() ?? "",
                    color: card.color ?? DEFAULT_COLOR,
                  })
                }
                onArchive={() => setArchived(card, true)}
                onDelete={() => remove(card)}
              />
            ))}
          </ul>

          {archived.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
                Arquivados
              </p>
              <ul className="flex flex-col gap-2">
                {archived.map((card) => (
                  <li
                    key={card.id}
                    className="card flex items-center justify-between gap-3 px-4 py-3 opacity-60"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot color={card.color} />
                      <span className="truncate">{card.name}</span>
                    </span>
                    <Button
                      variant="quiet"
                      className="px-2 py-1 text-xs"
                      onClick={() => setArchived(card, false)}
                    >
                      Reativar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {draft && (
        <Sheet
          title={draft.id ? "Editar cartão" : "Novo cartão"}
          onClose={() => {
            setDraft(null);
            setError(null);
          }}
        >
          <div className="flex flex-col gap-4">
            <Field label="Nome">
              <input
                className={inputClass}
                value={draft.name}
                autoFocus
                placeholder="Nubank, Inter, Itaú…"
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Dia do fechamento" hint="Opcional">
                <input
                  className={inputClass}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={draft.closing_day}
                  onChange={(event) =>
                    setDraft({ ...draft, closing_day: event.target.value })
                  }
                />
              </Field>
              <Field label="Dia do vencimento" hint="Opcional">
                <input
                  className={inputClass}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={draft.due_day}
                  onChange={(event) =>
                    setDraft({ ...draft, due_day: event.target.value })
                  }
                />
              </Field>
            </div>

            <Field label="Cor">
              <ColorPicker
                value={draft.color}
                onChange={(color) => setDraft({ ...draft, color })}
              />
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="mt-2 flex gap-2">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Salvando…" : "Salvar cartão"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function CardRow({
  card,
  uses,
  onEdit,
  onArchive,
  onDelete,
}: {
  card: Card;
  uses: number;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="card flex items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Dot color={card.color} />
        <div className="min-w-0">
          <p className="truncate font-medium">{card.name}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
            {card.closing_day && <span>fecha dia {card.closing_day}</span>}
            {card.closing_day && card.due_day && <span>·</span>}
            {card.due_day && <span>vence dia {card.due_day}</span>}
            {uses > 0 && (
              <Tag>
                {uses} {uses === 1 ? "gasto" : "gastos"}
              </Tag>
            )}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button variant="quiet" className="px-2 py-1 text-xs" onClick={onEdit}>
          Editar
        </Button>
        {uses > 0 ? (
          <Button
            variant="quiet"
            className="px-2 py-1 text-xs"
            onClick={onArchive}
          >
            Arquivar
          </Button>
        ) : (
          <DeleteButton onConfirm={onDelete} />
        )}
      </div>
    </li>
  );
}
