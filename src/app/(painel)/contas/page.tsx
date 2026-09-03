"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { TextField } from "@/components/form/Field";
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
} from "@/components/ui";
import { DEFAULT_COLOR, PALETTE } from "@/lib/palette";
import type { BankAccount } from "@/lib/types";

type Draft = { id: string | null; name: string; color: string };

export default function ContasPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me } = useScope();

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  // Quantos cartões e gastos apontam pra cada conta: define se dá pra excluir.
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // Conta bancária é privada: a RLS já devolve só as minhas.
    const [accountsResult, cardsResult, expensesResult] = await Promise.all([
      supabase
        .from("bank_accounts")
        .select("*")
        .eq("user_id", me.id)
        .order("archived")
        .order("name"),
      supabase.from("cards").select("bank_account_id").eq("user_id", me.id),
      supabase.from("expenses").select("bank_account_id").eq("user_id", me.id),
    ]);

    if (accountsResult.error) {
      setError(
        "Não deu para carregar suas contas. Se o app acabou de ser atualizado, a migração do banco pode não ter rodado ainda."
      );
      setLoading(false);
      return;
    }

    setError(null);
    setAccounts(accountsResult.data as BankAccount[]);

    const counts: Record<string, number> = {};
    for (const row of [
      ...(cardsResult.data ?? []),
      ...(expensesResult.data ?? []),
    ]) {
      if (row.bank_account_id)
        counts[row.bank_account_id] = (counts[row.bank_account_id] ?? 0) + 1;
    }
    setUsage(counts);

    setLoading(false);
  }, [supabase, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    const used = new Set(accounts.map((account) => account.color));
    const free = PALETTE.find((color) => !used.has(color)) ?? DEFAULT_COLOR;
    setDraft({ id: null, name: "", color: free });
  }

  async function save() {
    if (!draft) return;

    const name = draft.name.trim();
    if (!name) {
      setError("Dê um nome à conta.");
      return;
    }

    setSaving(true);
    setError(null);

    // O user_id vem do default auth.uid() do banco — nunca mandamos daqui.
    const payload = { name, color: draft.color };
    const { error: writeError } = draft.id
      ? await supabase.from("bank_accounts").update(payload).eq("id", draft.id)
      : await supabase.from("bank_accounts").insert(payload);

    setSaving(false);

    if (writeError) {
      setError(
        writeError.code === "23505"
          ? "Você já tem uma conta com esse nome."
          : "Não deu para salvar a conta. Tente de novo."
      );
      return;
    }

    setDraft(null);
    load();
  }

  async function setArchived(account: BankAccount, archived: boolean) {
    await supabase
      .from("bank_accounts")
      .update({ archived })
      .eq("id", account.id);
    load();
  }

  async function remove(account: BankAccount) {
    const { error: deleteError } = await supabase
      .from("bank_accounts")
      .delete()
      .eq("id", account.id);
    if (deleteError) {
      setError("Não deu para excluir. Arquive a conta no lugar disso.");
      return;
    }
    load();
  }

  const active = accounts.filter((account) => !account.archived);
  const archived = accounts.filter((account) => account.archived);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Contas"
        description="De onde o dinheiro sai. É o que liga um Pix à fatura do cartão."
        action={<Button onClick={openNew}>Nova conta</Button>}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta ainda"
          description="Cadastre a conta de onde saem seus pagamentos, para o relatório por ciclo saber o que juntar."
          action={<Button onClick={openNew}>Nova conta</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="grid gap-2 sm:grid-cols-2">
            {active.map((account) => (
              <li
                key={account.id}
                className="card flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Dot color={account.color} />
                  <span className="truncate font-medium">{account.name}</span>
                  {usage[account.id] > 0 && <Tag>{usage[account.id]}</Tag>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="quiet"
                    className="px-2 py-1 text-xs"
                    onClick={() =>
                      setDraft({
                        id: account.id,
                        name: account.name,
                        color: account.color,
                      })
                    }
                  >
                    Editar
                  </Button>
                  {usage[account.id] > 0 ? (
                    <Button
                      variant="quiet"
                      className="px-2 py-1 text-xs"
                      onClick={() => setArchived(account, true)}
                    >
                      Arquivar
                    </Button>
                  ) : (
                    <DeleteButton onConfirm={() => remove(account)} />
                  )}
                </span>
              </li>
            ))}
          </ul>

          {archived.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
                Arquivadas
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {archived.map((account) => (
                  <li
                    key={account.id}
                    className="card flex items-center justify-between gap-3 px-4 py-3 opacity-60"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Dot color={account.color} />
                      <span className="truncate">{account.name}</span>
                    </span>
                    <Button
                      variant="quiet"
                      className="px-2 py-1 text-xs"
                      onClick={() => setArchived(account, false)}
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
          title={draft.id ? "Editar conta" : "Nova conta"}
          onClose={() => {
            setDraft(null);
            setError(null);
          }}
        >
          <div className="flex flex-col gap-4">
            <TextField
              label="Nome"
              value={draft.name}
              autoFocus
              placeholder="Nubank, Inter, Itaú…"
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />

            <Field label="Cor">
              <ColorPicker
                value={draft.color}
                onChange={(color) => setDraft({ ...draft, color })}
              />
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="mt-2 flex gap-2">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Salvando…" : "Salvar conta"}
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
