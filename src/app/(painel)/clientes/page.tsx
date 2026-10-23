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
  apagarCliente,
  buscarCep,
  codigoDoCliente,
  linkWhatsApp,
  listarClientes,
  normalizar,
  salvarCliente,
  ultimosClientes,
} from "@/lib/orcamentos-app";
import type { OrcCliente, OrcClienteInput } from "@/lib/types";

type Draft = { id: string | null } & { [K in keyof OrcClienteInput]: string };

const VAZIO: Draft = {
  id: null,
  name: "",
  phone: "",
  email: "",
  doc: "",
  cep: "",
  street: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  uf: "",
  notes: "",
};

/**
 * Clientes da empresa (C28). São os MESMOS do app de orçamentos: quem é
 * cadastrado aqui aparece lá na hora de fazer orçamento, e o contrário.
 */
export default function ClientesPage() {
  const { empresa, recursos } = useScope();
  const [clientes, setClientes] = useState<OrcCliente[]>(() => ultimosClientes() ?? []);
  const [loading, setLoading] = useState(() => !ultimosClientes());
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);

  const ligado = empresa && recursos.orcamentos;

  useEffect(() => {
    if (!ligado) return;
    listarClientes()
      .then((lista) => {
        setClientes(lista);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [ligado]);

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return clientes;
    const digitos = termo.replace(/\D/g, "");
    return clientes.filter(
      (c) =>
        normalizar(c.name).includes(termo) ||
        (digitos.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digitos)) ||
        normalizar(c.city ?? "").includes(termo)
    );
  }, [clientes, busca]);

  if (!ligado) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle voltar={VOLTAR_AJUSTES} title="Clientes" />
        <SemLigacao empresa={empresa} />
      </div>
    );
  }

  function abrir(c: OrcCliente) {
    const d = { ...VAZIO, id: c.id } as Draft;
    for (const k of Object.keys(VAZIO) as (keyof Draft)[]) {
      if (k !== "id") d[k] = (c[k as keyof OrcCliente] as string | null) ?? "";
    }
    setDraft(d);
    setFormError(null);
  }

  async function preencherCep(cep: string) {
    if (cep.replace(/\D/g, "").length !== 8) return;
    setBuscandoCep(true);
    const achado = await buscarCep(cep);
    setBuscandoCep(false);
    if (!achado) return;
    // Só preenche o que está vazio: não apaga o que a pessoa já digitou.
    setDraft((d) =>
      d
        ? {
            ...d,
            street: d.street || achado.street || "",
            district: d.district || achado.district || "",
            city: d.city || achado.city || "",
            uf: d.uf || achado.uf || "",
          }
        : d
    );
  }

  async function salvar() {
    if (!draft) return;
    if (!draft.name.trim()) return setFormError("Diga o nome do cliente.");
    setSaving(true);
    setFormError(null);
    const { id, ...campos } = draft;
    try {
      const salvo = await salvarCliente(campos, id ?? undefined);
      setClientes((lista) =>
        [...lista.filter((c) => c.id !== salvo.id), salvo].sort((a, b) => a.name.localeCompare(b.name))
      );
      setDraft(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não deu para salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function remover(id: string) {
    try {
      await apagarCliente(id);
      setClientes((lista) => lista.filter((c) => c.id !== id));
      setDraft(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Não deu para apagar.");
    }
  }

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        voltar={VOLTAR_AJUSTES}
        title="Clientes"
        description="Os mesmos do app de orçamentos: quem você cadastra aqui aparece lá, e o contrário."
        action={
          <Button
            onClick={() => {
              setDraft({ ...VAZIO });
              setFormError(null);
            }}
          >
            Novo cliente
          </Button>
        }
      />

      <input
        type="search"
        className={inputClass}
        placeholder="Buscar por nome, telefone ou cidade"
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
        aria-label="Buscar cliente"
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : visiveis.length === 0 ? (
        <EmptyState
          title={busca ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
          description={
            busca
              ? "Confira a grafia, ou cadastre o cliente novo."
              : "Cadastre os clientes de sempre pra não digitar os dados toda vez que marcar um atendimento."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {visiveis.map((c) => {
            const zap = linkWhatsApp(c.phone);
            return (
              <li key={c.id} className="card flex items-center justify-between gap-3 px-4 py-3">
                <button type="button" onClick={() => abrir(c)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                    <Tag>{codigoDoCliente(c.code)}</Tag>
                    {c.phone && <span>{c.phone}</span>}
                    {(c.district || c.city) && (
                      <span className="truncate">{[c.district, c.city].filter(Boolean).join(", ")}</span>
                    )}
                  </p>
                </button>
                {zap && (
                  <a
                    href={zap}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg border border-[var(--color-line)] px-3 py-2 text-xs font-semibold text-[var(--color-in)]"
                  >
                    WhatsApp
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <Sheet title={draft.id ? "Editar cliente" : "Novo cliente"} onClose={() => setDraft(null)}>
          <div className="flex flex-col gap-4">
            <Field label="Nome">
              <input
                className={inputClass}
                value={draft.name}
                autoFocus={!draft.id}
                onChange={(event) => set({ name: event.target.value })}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Telefone" hint="Com DDD. Serve pro WhatsApp.">
                <input
                  className={inputClass}
                  inputMode="tel"
                  value={draft.phone}
                  onChange={(event) => set({ phone: event.target.value })}
                />
              </Field>
              <Field label="E-mail" hint="Opcional">
                <input
                  className={inputClass}
                  type="email"
                  value={draft.email}
                  onChange={(event) => set({ email: event.target.value })}
                />
              </Field>
            </div>
            <Field label="CPF ou CNPJ" hint="Opcional">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.doc}
                onChange={(event) => set({ doc: event.target.value })}
              />
            </Field>

            <Field label="CEP" hint={buscandoCep ? "Buscando endereço…" : "Preenche rua, bairro e cidade."}>
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.cep}
                onChange={(event) => {
                  set({ cep: event.target.value });
                  preencherCep(event.target.value);
                }}
              />
            </Field>
            <div className="grid grid-cols-[1fr_6rem] gap-4">
              <Field label="Rua">
                <input
                  className={inputClass}
                  value={draft.street}
                  onChange={(event) => set({ street: event.target.value })}
                />
              </Field>
              <Field label="Número">
                <input
                  className={inputClass}
                  value={draft.number}
                  onChange={(event) => set({ number: event.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Complemento" hint="Opcional">
                <input
                  className={inputClass}
                  value={draft.complement}
                  onChange={(event) => set({ complement: event.target.value })}
                />
              </Field>
              <Field label="Bairro">
                <input
                  className={inputClass}
                  value={draft.district}
                  onChange={(event) => set({ district: event.target.value })}
                />
              </Field>
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-4">
              <Field label="Cidade">
                <input
                  className={inputClass}
                  value={draft.city}
                  onChange={(event) => set({ city: event.target.value })}
                />
              </Field>
              <Field label="UF">
                <input
                  className={inputClass}
                  maxLength={2}
                  value={draft.uf}
                  onChange={(event) => set({ uf: event.target.value.toUpperCase() })}
                />
              </Field>
            </div>
            <Field label="Observações" hint="Opcional. Ex.: portão azul, falar com a Dona Maria.">
              <textarea
                className={`${inputClass} min-h-20`}
                value={draft.notes}
                onChange={(event) => set({ notes: event.target.value })}
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
              {saving ? "Salvando…" : "Salvar cliente"}
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
            {draft.id && (
              <DeleteButton onConfirm={() => remover(draft.id!)} label="Apagar" />
            )}
          </div>
          {draft.id && (
            <p className="mt-3 text-xs text-[var(--color-text-faint)]">
              Apagar tira o cliente dos dois apps. Os orçamentos dele continuam, com os dados de quando foram feitos.
            </p>
          )}
        </Sheet>
      )}

      {!loading && clientes.length > 0 && (
        <p className="text-xs text-[var(--color-text-faint)]">
          {clientes.length} {clientes.length === 1 ? "cliente" : "clientes"}
        </p>
      )}
    </div>
  );
}
