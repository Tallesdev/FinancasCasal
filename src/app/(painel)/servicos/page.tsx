"use client";

import { useEffect, useMemo, useState } from "react";
import { useScope } from "@/components/ScopeProvider";
import {
  Button,
  DeleteButton,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  PageTitle,
  Sheet,
  Tag,
  VOLTAR_AJUSTES,
  inputClass,
} from "@/components/ui";
import { SemLigacao } from "@/components/SemLigacao";
import {
  arquivarServico,
  listarServicos,
  normalizar,
  salvarServico,
  ultimosServicos,
} from "@/lib/orcamentos-app";
import { money } from "@/lib/format";
import type { OrcServico } from "@/lib/types";

type Draft = { id: string | null; name: string; description: string; price: string };

/**
 * Serviços pré-cadastrados (C28): o catálogo do app de orçamentos. São eles
 * que se escolhem ao marcar um cliente na agenda.
 */
export default function ServicosPage() {
  const { empresa, recursos } = useScope();
  const [servicos, setServicos] = useState<OrcServico[]>(() => ultimosServicos() ?? []);
  const [loading, setLoading] = useState(() => !ultimosServicos());
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ligado = empresa && recursos.orcamentos;

  useEffect(() => {
    if (!ligado) return;
    listarServicos()
      .then((lista) => {
        setServicos(lista);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ligado]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    const lista = [...servicos].sort((a, b) => a.name.localeCompare(b.name));
    return termo ? lista.filter((s) => normalizar(s.name).includes(termo)) : lista;
  }, [servicos, busca]);

  if (!ligado) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle voltar={VOLTAR_AJUSTES} title="Serviços" />
        <SemLigacao empresa={empresa} />
      </div>
    );
  }

  async function salvar() {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) return setFormError("Diga o nome do serviço.");
    // "1.234,56" e "1234.56" valem; com vírgula, ponto é milhar.
    const bruto = draft.price.trim();
    const price = !bruto ? 0 : Number(bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto);
    if (!Number.isFinite(price) || price < 0) return setFormError("Preço inválido.");
    setSaving(true);
    setFormError(null);
    try {
      const salvo = await salvarServico(
        { name, description: draft.description.trim() || null, price },
        draft.id ?? undefined
      );
      setServicos((lista) => [...lista.filter((s) => s.id !== salvo.id), salvo]);
      setDraft(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não deu para salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function arquivar(id: string) {
    try {
      await arquivarServico(id);
      setServicos((lista) => lista.filter((s) => s.id !== id));
      setDraft(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não deu para arquivar.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        voltar={VOLTAR_AJUSTES}
        title="Serviços"
        description="Os do catálogo do app de orçamentos. Ao marcar um cliente na agenda, é daqui que se escolhe o que foi combinado."
        action={
          <Button
            onClick={() => {
              setDraft({ id: null, name: "", description: "", price: "" });
              setFormError(null);
            }}
          >
            Novo serviço
          </Button>
        }
      />

      <input
        type="search"
        className={inputClass}
        placeholder="Buscar serviço"
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
        aria-label="Buscar serviço"
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : visiveis.length === 0 ? (
        <EmptyState
          title={busca ? "Nenhum serviço encontrado" : "Nenhum serviço ainda"}
          description="Cadastre os serviços que vocês fazem sempre: instalação de tomada, troca de disjuntor, quadro de distribuição…"
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  setDraft({
                    id: s.id,
                    name: s.name,
                    description: s.description ?? "",
                    price: s.price ? String(s.price).replace(".", ",") : "",
                  });
                  setFormError(null);
                }}
                className="card flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <p className="font-medium break-words">{s.name}</p>
                  {s.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-faint)]">{s.description}</p>
                  )}
                  {s.kind === "kit" && (
                    <p className="mt-1 text-xs">
                      <Tag>kit</Tag>
                    </p>
                  )}
                </div>
                {s.price > 0 && <span className="money shrink-0 text-sm font-semibold">{money(s.price)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <Sheet title={draft.id ? "Editar serviço" : "Novo serviço"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Nome">
              <input
                className={inputClass}
                value={draft.name}
                autoFocus={!draft.id}
                placeholder="Instalação de tomada"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </Field>
            <Field label="Descrição" hint="Opcional. Vai também pro orçamento, se usarem este item lá.">
              <textarea
                className={`${inputClass} min-h-20`}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Field>
            <Field label="Preço" hint="Opcional. É o preço sugerido no app de orçamentos.">
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder="0,00"
                value={draft.price}
                onChange={(event) => setDraft({ ...draft, price: event.target.value })}
              />
            </Field>
          </div>

          {formError && (
            <div className="mt-4">
              <ErrorNote>{formError}</ErrorNote>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={salvar} disabled={saving} className="flex-1">
              {saving ? "Salvando…" : "Salvar serviço"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            {draft.id && <DeleteButton onConfirm={() => arquivar(draft.id!)} label="Arquivar" />}
          </div>
          {draft.id && (
            <p className="mt-3 text-xs text-[var(--color-text-faint)]">
              Arquivar tira o serviço das listas dos dois apps. Orçamentos e atendimentos antigos continuam com ele.
            </p>
          )}
        </Sheet>
      )}
    </div>
  );
}
