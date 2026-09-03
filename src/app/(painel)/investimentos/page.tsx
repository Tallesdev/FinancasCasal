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
import { ASSET_TYPES } from "@/lib/palette";
import { ENTRY_KIND_LABEL, type EntryKind, type Investment } from "@/lib/types";

type Draft = {
  id: string | null;
  name: string;
  asset_type: string;
  amount: string;
  kind: EntryKind;
  start_date: string;
  end_date: string;
  notes: string;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  asset_type: "Renda fixa",
  amount: "",
  kind: "recurring",
  start_date: toISODate(new Date()),
  end_date: "",
  notes: "",
};

export default function InvestimentosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, partner, userIds, scope } = useScope();

  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: readError } = await supabase
      .from("investments")
      .select("*")
      .order("start_date", { ascending: false });

    if (readError) setError("Não deu para carregar os investimentos.");
    else {
      setError(null);
      setInvestments(data as Investment[]);
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

  const visible = investments.filter((item) => userIds.includes(item.user_id));

  /** Aporte mensal em vigor hoje. */
  const monthly = visible
    .filter((item) => item.kind === "recurring")
    .filter((item) => {
      const today = toISODate(new Date());
      return item.start_date <= today && (!item.end_date || item.end_date >= today);
    })
    .reduce((sum, item) => sum + Number(item.amount), 0);

  async function save() {
    if (!draft) return;

    const name = draft.name.trim();
    const amount = Number(draft.amount.replace(",", "."));

    if (!name) return setFormError("Dê um nome ao investimento.");
    if (!Number.isFinite(amount) || amount <= 0)
      return setFormError("Informe um valor maior que zero.");
    if (!draft.start_date) return setFormError("Escolha a data.");
    if (
      draft.kind === "recurring" &&
      draft.end_date &&
      draft.end_date < draft.start_date
    )
      return setFormError("O fim não pode ser antes do começo.");

    const payload = {
      name,
      asset_type: draft.asset_type,
      amount,
      kind: draft.kind,
      start_date: draft.start_date,
      end_date: draft.kind === "recurring" && draft.end_date ? draft.end_date : null,
      notes: draft.notes.trim() || null,
    };

    setSaving(true);
    setFormError(null);

    const { error: writeError } = draft.id
      ? await supabase.from("investments").update(payload).eq("id", draft.id)
      : await supabase.from("investments").insert(payload);

    setSaving(false);

    if (writeError) {
      setFormError("Não deu para salvar. Confira os campos.");
      return;
    }

    setDraft(null);
    load();
  }

  async function remove(id: string) {
    await supabase.from("investments").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Investimentos"
        description={
          scope === "us"
            ? "O que os dois guardam todo mês."
            : "O que você guarda todo mês."
        }
        action={
          <Button onClick={() => setDraft({ ...EMPTY })}>Novo aporte</Button>
        }
      />

      <div className="card flex items-baseline justify-between gap-3 px-4 py-4">
        <span className="text-sm text-[var(--color-text-dim)]">
          Aporte mensal
        </span>
        <strong className="money text-xl text-[var(--color-invest)]">
          {money(monthly)}
        </strong>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          title="Nada guardado ainda"
          description="Cadastre um aporte para acompanhar quanto sobra e vira investimento."
          action={
            <Button onClick={() => setDraft({ ...EMPTY })}>Novo aporte</Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((item) => {
            const mine = item.user_id === me.id;
            const owner = profileById[item.user_id];

            return (
              <li
                key={item.id}
                className="card flex items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{item.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                    <Tag>{item.asset_type}</Tag>
                    <Tag>{ENTRY_KIND_LABEL[item.kind]}</Tag>
                    <span>
                      {item.kind === "one_time"
                        ? formatDate(item.start_date)
                        : `desde ${formatDate(item.start_date)}`}
                    </span>
                    {scope === "us" && owner && (
                      <OwnerTag name={owner.name} accent={owner.accent} />
                    )}
                  </p>
                  {item.notes && (
                    <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                      {item.notes}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="money font-semibold text-[var(--color-invest)]">
                    {money(item.amount)}
                  </span>
                  {mine && (
                    <span className="flex items-center gap-1">
                      <Button
                        variant="quiet"
                        className="px-2 py-0.5 text-xs"
                        onClick={() => {
                          setDraft({
                            id: item.id,
                            name: item.name,
                            asset_type: item.asset_type,
                            amount: String(item.amount),
                            kind: item.kind,
                            start_date: item.start_date.slice(0, 10),
                            end_date: item.end_date?.slice(0, 10) ?? "",
                            notes: item.notes ?? "",
                          });
                          setFormError(null);
                        }}
                      >
                        Editar
                      </Button>
                      <DeleteButton onConfirm={() => remove(item.id)} />
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
          title={draft.id ? "Editar aporte" : "Novo aporte"}
          onClose={() => setDraft(null)}
        >
          <div className="flex flex-col gap-4">
            <Field label="Nome">
              <input
                className={inputClass}
                value={draft.name}
                autoFocus
                placeholder="Tesouro Selic, CDB do Inter…"
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>

            <Field label="Tipo de ativo">
              <select
                className={inputClass}
                value={draft.asset_type}
                onChange={(event) =>
                  setDraft({ ...draft, asset_type: event.target.value })
                }
              >
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Valor" hint="O valor de um aporte.">
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
              label="Frequência"
              value={draft.kind}
              onChange={(kind) =>
                setDraft({
                  ...draft,
                  kind,
                  end_date: kind === "recurring" ? draft.end_date : "",
                })
              }
              options={[
                { value: "recurring" as EntryKind, label: "Todo mês" },
                { value: "one_time" as EntryKind, label: "Aporte único" },
              ]}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={draft.kind === "one_time" ? "Data" : "Começa em"}>
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
                {saving ? "Salvando…" : "Salvar aporte"}
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
