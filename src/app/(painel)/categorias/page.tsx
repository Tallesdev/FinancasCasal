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
import { DEFAULT_COLOR, PALETTE } from "@/lib/palette";
import type { Category } from "@/lib/types";

type Draft = { id: string | null; name: string; color: string };

export default function CategoriasPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me } = useScope();

  const [categories, setCategories] = useState<Category[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // A lista de categorias é pessoal, mesmo que a casa consiga ler as duas.
    const [categoriesResult, expensesResult] = await Promise.all([
      supabase
        .from("categories")
        .select("*")
        .eq("user_id", me.id)
        .order("archived")
        .order("name"),
      supabase.from("expenses").select("category_id").eq("user_id", me.id),
    ]);

    if (categoriesResult.error) {
      setError("Não deu para carregar suas categorias.");
    } else {
      setCategories(categoriesResult.data as Category[]);
      setError(null);
    }

    const counts: Record<string, number> = {};
    for (const row of expensesResult.data ?? []) {
      if (row.category_id)
        counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
    }
    setUsage(counts);

    setLoading(false);
  }, [supabase, me.id]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    // Sugere uma cor ainda não usada, para a lista não virar tudo cinza.
    const used = new Set(categories.map((category) => category.color));
    const free = PALETTE.find((color) => !used.has(color)) ?? DEFAULT_COLOR;
    setDraft({ id: null, name: "", color: free });
  }

  async function save() {
    if (!draft) return;

    const name = draft.name.trim();
    if (!name) {
      setError("Dê um nome à categoria.");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = { name, color: draft.color };
    const { error: writeError } = draft.id
      ? await supabase.from("categories").update(payload).eq("id", draft.id)
      : await supabase.from("categories").insert(payload);

    setSaving(false);

    if (writeError) {
      setError(
        writeError.code === "23505"
          ? "Você já tem uma categoria com esse nome."
          : "Não deu para salvar a categoria. Tente de novo."
      );
      return;
    }

    setDraft(null);
    load();
  }

  async function setArchived(category: Category, archived: boolean) {
    await supabase.from("categories").update({ archived }).eq("id", category.id);
    load();
  }

  async function remove(category: Category) {
    const { error: deleteError } = await supabase
      .from("categories")
      .delete()
      .eq("id", category.id);
    if (deleteError) {
      setError("Não deu para excluir. Arquive a categoria no lugar disso.");
      return;
    }
    load();
  }

  const active = categories.filter((category) => !category.archived);
  const archived = categories.filter((category) => category.archived);

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Categorias"
        description="Sua lista. No relatório do casal, categorias de mesmo nome somam."
        action={<Button onClick={openNew}>Nova categoria</Button>}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : categories.length === 0 ? (
        <EmptyState
          title="Nenhuma categoria"
          description="Crie categorias para saber para onde o dinheiro está indo."
          action={<Button onClick={openNew}>Nova categoria</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <ul className="grid gap-2 sm:grid-cols-2">
            {active.map((category) => (
              <li
                key={category.id}
                className="card flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Dot color={category.color} />
                  <span className="truncate font-medium">{category.name}</span>
                  {usage[category.id] > 0 && <Tag>{usage[category.id]}</Tag>}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="quiet"
                    className="px-2 py-1 text-xs"
                    onClick={() =>
                      setDraft({
                        id: category.id,
                        name: category.name,
                        color: category.color,
                      })
                    }
                  >
                    Editar
                  </Button>
                  {usage[category.id] > 0 ? (
                    <Button
                      variant="quiet"
                      className="px-2 py-1 text-xs"
                      onClick={() => setArchived(category, true)}
                    >
                      Arquivar
                    </Button>
                  ) : (
                    <DeleteButton onConfirm={() => remove(category)} />
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
                {archived.map((category) => (
                  <li
                    key={category.id}
                    className="card flex items-center justify-between gap-3 px-4 py-3 opacity-60"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Dot color={category.color} />
                      <span className="truncate">{category.name}</span>
                    </span>
                    <Button
                      variant="quiet"
                      className="px-2 py-1 text-xs"
                      onClick={() => setArchived(category, false)}
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
          title={draft.id ? "Editar categoria" : "Nova categoria"}
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
                placeholder="Mercado, Lazer, Pet…"
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>

            <Field label="Cor">
              <ColorPicker
                value={draft.color}
                onChange={(color) => setDraft({ ...draft, color })}
              />
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <div className="mt-2 flex gap-2">
              <Button onClick={save} disabled={saving} className="flex-1">
                {saving ? "Salvando…" : "Salvar categoria"}
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
