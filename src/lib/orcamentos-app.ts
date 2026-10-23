"use client";

import type { OrcAprovado, OrcCliente, OrcClienteInput, OrcServico } from "./types";

/**
 * Clientes, serviços e orçamentos aprovados do app de orçamentos, do lado
 * do navegador (C27, C28). Tudo passa pelas rotas /api/orcamentos: a chave
 * do outro banco nunca chega aqui.
 */

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (r.status === 204) return undefined as T;
  let corpo: { error?: string } & Record<string, unknown> = {};
  try {
    corpo = await r.json();
  } catch {
    // Sem corpo: cai no erro genérico abaixo.
  }
  if (!r.ok) throw new Error(corpo.error ?? "Não deu para falar com o app de orçamentos.");
  return corpo as T;
}

/**
 * A última lista que veio, guardada na memória da aba: a agenda e as telas
 * abrem com ela na hora e atualizam por trás (o outro banco fica longe).
 */
let clientesGuardados: OrcCliente[] | null = null;
let servicosGuardados: OrcServico[] | null = null;
export const ultimosClientes = () => clientesGuardados;
export const ultimosServicos = () => servicosGuardados;

export async function listarClientes() {
  const { clientes } = await pedir<{ clientes: OrcCliente[] }>("/api/orcamentos/clientes");
  clientesGuardados = clientes;
  return clientes;
}

export async function salvarCliente(dados: Partial<OrcClienteInput>, id?: string) {
  const { cliente } = await pedir<{ cliente: OrcCliente }>(
    id ? `/api/orcamentos/clientes/${id}` : "/api/orcamentos/clientes",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(dados) }
  );
  if (clientesGuardados)
    clientesGuardados = [...clientesGuardados.filter((c) => c.id !== cliente.id), cliente].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  return cliente;
}

export async function apagarCliente(id: string) {
  await pedir<void>(`/api/orcamentos/clientes/${id}`, { method: "DELETE" });
  if (clientesGuardados) clientesGuardados = clientesGuardados.filter((c) => c.id !== id);
}

const comPreco = (s: OrcServico): OrcServico => ({ ...s, price: Number(s.price) });

export async function listarServicos() {
  const { servicos } = await pedir<{ servicos: OrcServico[] }>("/api/orcamentos/servicos");
  servicosGuardados = servicos.map(comPreco);
  return servicosGuardados;
}

export async function salvarServico(
  dados: { name: string; description: string | null; price: number },
  id?: string
) {
  const { servico } = await pedir<{ servico: OrcServico }>(
    id ? `/api/orcamentos/servicos/${id}` : "/api/orcamentos/servicos",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(dados) }
  );
  const salvo = comPreco(servico);
  if (servicosGuardados)
    servicosGuardados = id
      ? servicosGuardados.map((s) => (s.id === id ? salvo : s))
      : [...servicosGuardados, salvo];
  return salvo;
}

export async function arquivarServico(id: string) {
  await pedir<void>(`/api/orcamentos/servicos/${id}`, { method: "DELETE" });
  if (servicosGuardados) servicosGuardados = servicosGuardados.filter((s) => s.id !== id);
}

export const listarAprovados = () =>
  pedir<{ aprovados: OrcAprovado[] }>("/api/orcamentos/aprovados").then((r) => r.aprovados);

/** Endereço numa linha, igual ao do PDF do orçamento. */
export function enderecoDoCliente(
  c: Pick<OrcCliente, "street" | "number" | "complement" | "district" | "city" | "uf">
) {
  const linha1 = [c.street, c.number].filter(Boolean).join(", ");
  return [
    [linha1, c.complement].filter(Boolean).join(" - "),
    c.district,
    [c.city, c.uf].filter(Boolean).join("/"),
  ]
    .filter(Boolean)
    .join(" - ");
}

/** Sem acento e minúsculo: "joão" acha "João". */
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const codigoDoCliente = (code: number) => `#${String(code).padStart(4, "0")}`;

/** Só os dígitos, com 55 na frente — o que o link do WhatsApp quer. */
export function linkWhatsApp(telefone: string | null | undefined) {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? "55" + d : d}`;
}

export function linkMapa(endereco: string | null | undefined) {
  if (!endereco?.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

/** CEP → endereço, pelo ViaCEP (o mesmo que o app de orçamentos usa). */
export async function buscarCep(cep: string): Promise<Partial<OrcClienteInput> | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    const j = (await r.json()) as {
      erro?: boolean;
      logradouro?: string;
      bairro?: string;
      localidade?: string;
      uf?: string;
    };
    if (j.erro) return null;
    return { street: j.logradouro || null, district: j.bairro || null, city: j.localidade || null, uf: j.uf || null };
  } catch {
    return null;
  }
}
