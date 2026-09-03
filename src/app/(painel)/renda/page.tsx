"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { SegmentedField } from "@/components/form/Field";
import {
  Button,
  DeleteButton,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  OwnerTag,
  PageTitle,
  Sheet,
  Tag,
  inputClass,
} from "@/components/ui";
import { formatDate, money, toISODate } from "@/lib/format";
import { ENTRY_KIND_LABEL, type EntryKind, type Income } from "@/lib/types";

type Draft = {
  id: string | null;
  source: string;
  amount: string;
  kind: EntryKind;
  start_date: string;
  end_date: string;
  notes: string;
};

const EMPTY: Draft = {
  id: null,
  source: "",
  amount: "",
  kind: "recurring",
  start_date: toISODate(new Date()),
  end_date: "",
  notes: "",
};

export default function RendaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, partner, userIds, scope } = useScope();

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: readError } = await supabase
      .from("incomes")
      .select("*")
      .order("start_date", { ascending: false });

    if (readError) setError("Não deu para carregar a renda.");
    else {
      setError(null);
      setIncomes(data as Income[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const profileById = useMemo(() => {
    const map: Record<string, { name: string; accent: "a" | "b" }> = {
      [me.id]: { name: me.display_name, accent: me.accent },
    };
    if (partner)
      map[partner.id] = { name: partner.display_name, accent: partner.accent };
    return map;
  }, [me, partner]);

  // Nenhuma leitura ignora o escopo.
  const visible = incomes.filter((income) => userIds.includes(income.user_id));

  /** Quanto entra por mês hoje: só o que é recorrente e ainda está valendo. */
  const monthly = visible
    .filter((income) => income.kind === "recurring")
    .filter((income) => {
      const today = toISODate(new Date());
      return income.start_date <= today && (!income.end_date || income.end_date >= today);
    })
    .reduce((sum, income) => sum + Number(income.amount), 0);

  async function save() {
    if (!draft) return;

    const source = draft.source.trim();
    const amount = Number(draft.amount.replace(",", "."));

    if (!source) return setFormError("Diga de onde vem essa renda.");
    if (!Number.isFinite(amount) || amount <= 0)
      return setFormError("Informe um valor maior que zero.");
    if (!draft.start_date) return setFormError("Escolha a data de início.");
    if (
      draft.kind === "recurring" &&
      draft.end_date &&
      draft.end_date < draft.start_date
    )
      return setFormError("O fim não pode ser antes do começo.");

    const payload = {
      source,
      amount,
      kind: draft.kind,
      start_date: draft.start_date,
      // Renda avulsa não tem fim: acontece uma vez só.
      end_date: draft.kind === "recurring" && draft.end_date ? draft.end_date : null,
      notes: draft.notes.trim() || null,
    };

    setSaving(true);
    setFormError(null);

    const { error: writeError } = draft.id
      ? await supabase.from("incomes").update(payload).eq("id", draft.id)
      : await supabase.from("incomes").insert(payload);

    setSaving(false);

    if (writeError) {
      setFormError("Não deu para salvar. Confira os campos.");
      return;
    }

    setDraft(null);
    load();
  }

  async function remove(id: string) {
    await supabase.from("incomes").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Renda"
        description={
          scope === "us"
            ? "O que entra para os dois."
            : "O que entra na sua conta."
        }
        action={
          <Button onClick={() => setDraft({ ...EMPTY })}>Nova renda</Button>
        }
      />

      <div className="card flex items-baseline justify-between gap-3 px-4 py-4">
        <span className="text-sm text-[var(--color-text-dim)]">
          Entra todo mês
        </span>
        <strong className="money text-xl text-[var(--color-in)]">
          {money(monthly)}
        </strong>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nenhuma renda cadastrada"
          description="Cadastre o salário e o que mais entra para o saldo fechar."
          action={
            <Button onClick={() => setDraft({ ...EMPTY })}>Nova renda</Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((income) => {
            const mine = income.user_id === me.id;
            const owner = profileById[income.user_id];
            const ended =
              income.end_date && income.end_date < toISODate(new Date());

            return (
              <li
                key={income.id}
                className={[
                  "card flex items-start justify-between gap-3 px-4 py-3",
                  ended ? "opacity-60" : "",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{income.source}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                    <Tag>{ENTRY_KIND_LABEL[income.kind]}</Tag>
                    <span>
                      {income.kind === "one_time"
                        ? formatDate(income.start_date)
                        : `desde ${formatDate(income.start_date)}`}
                    </span>
                    {income.end_date && (
                      <span>até {formatDate(income.end_date)}</span>
                    )}
                    {scope === "us" && owner && (
                      <OwnerTag name={owner.name} accent={owner.accent} />
                    )}
                  </p>
                  {income.notes && (
                    <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                      {income.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="money font-semibold text-[var(--color-in)]">
                    {money(income.amount)}
                  </span>
                  {mine && (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="quiet"
                        className="px-2 py-0.5 text-xs"
                        onClick={() => {
                          setDraft({
                            id: income.id,
                            source: income.source,
                            amount: String(income.amount),
                            kind: income.kind,
                            start_date: income.start_date.slice(0, 10),
                            end_date: income.end_date?.slice(0, 10) ?? "",
                            notes: income.notes ?? "",
                          });
                          setFormError(null);
                        }}
                      >
                        Editar
                      </Button>
                      <DeleteButton onConfirm={() => remove(income.id)} />
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
          title={draft.id ? "Editar renda" : "Nova renda"}
          onClose={() => setDraft(null)}
        >
          <div className="flex flex-col gap-4">
            <Field label="De onde vem">
              <input
                className={inputClass}
                value={draft.source}
                autoFocus
                placeholder="Salário, freela, aluguel…"
                onChange={(event) =>
                  setDraft({ ...draft, source: event.target.value })
                }
              />
            </Field>

            <Field label="Valor">
              <input
                className={`${inputClass} money`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={draft.amount}
                onChange={(event) =>
                  setDraft({ ...draft, amount: event.target.value })
                }
              />
            </Field>

            <SegmentedField
              label="Tipo"
              value={draft.kind}
              onChange={(kind) =>
                setDraft({
                  ...draft,
                  kind,
                  end_date: kind === "recurring" ? draft.end_date : "",
                })
              }
              options={(["recurring", "one_time"] as EntryKind[]).map((kind) => ({
                value: kind,
                label: ENTRY_KIND_LABEL[kind],
              }))}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label={draft.kind === "one_time" ? "Data" : "Começa em"}
              >
                <input
                  className={inputClass}
                  type="date"
                  value={draft.start_date}
                  onChange={(event) =>
                    setDraft({ ...draft, start_date: event.target.value })
                  }
                />
              </Field>

              {draft.kind === "recurring" && (
                <Field label="Termina em" hint="Deixe vazio se não tem fim.">
                  <input
                    className={inputClass}
                    type="date"
                    value={draft.end_date}
                    onChange={(event) =>
                      setDraft({ ...draft, end_date: event.target.value })
                    }
                  />
                </Field>
              )}
            </div>

            <Field label="Observação" hint="Opcional">
              <input
                className={inputClass}
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
              />
            </Field>

            {formError && <ErrorNote>{formError}</ErrorNote>}

            <div className="mt-2 flex gap-2">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Salvando…" : "Salvar renda"}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
