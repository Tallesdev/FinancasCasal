import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SEM_SESSAO, erro, sessao } from "@/lib/rotas";

/**
 * Ponte com o app JJ Orçamentos (C27, C28). SÓ DO SERVIDOR.
 *
 * Os dois apps têm bancos separados. Clientes e serviços são os mesmos nos
 * dois: o RumoFácil lê e grava no banco dos orçamentos por aqui, com a
 * chave secreta dele — que ignora a RLS de lá. Por isso toda consulta é
 * presa à empresa (company_id) e só quem é da empresa ligada no RumoFácil
 * (ORCAMENTOS_HOUSEHOLD_ID) chega até aqui.
 *
 * Variáveis (Vercel → Settings → Environment Variables):
 *   ORCAMENTOS_SUPABASE_URL         https://<projeto>.supabase.co do app de orçamentos
 *   ORCAMENTOS_SUPABASE_SECRET_KEY  sb_secret_... do app de orçamentos
 *   ORCAMENTOS_HOUSEHOLD_ID         id da empresa no RumoFácil que pode usar
 *   ORCAMENTOS_COMPANY_ID           opcional: id da empresa lá; sem ela, usa a única que existir
 */

export function orcamentosConfigurado() {
  return Boolean(
    process.env.ORCAMENTOS_SUPABASE_URL &&
      process.env.ORCAMENTOS_SUPABASE_SECRET_KEY &&
      process.env.ORCAMENTOS_HOUSEHOLD_ID
  );
}

/** A empresa do RumoFácil que está ligada aos orçamentos. */
export function casaLigada(householdId: string | null | undefined) {
  return orcamentosConfigurado() && householdId === process.env.ORCAMENTOS_HOUSEHOLD_ID;
}

let banco: SupabaseClient | null = null;
function bancoDosOrcamentos() {
  banco ??= createClient(
    process.env.ORCAMENTOS_SUPABASE_URL!,
    process.env.ORCAMENTOS_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return banco;
}

let empresa: string | null = process.env.ORCAMENTOS_COMPANY_ID?.trim() || null;
async function empresaDosOrcamentos(db: SupabaseClient) {
  if (empresa) return empresa;
  // Hoje o app de orçamentos tem uma empresa só (JJ Tecnologia). Se um dia
  // tiver mais, adivinhar seria perigoso: exige a variável.
  const { data, error } = await db.from("companies").select("id").limit(2);
  if (error) throw new Error(`orçamentos: ${error.message}`);
  if (!data || data.length !== 1)
    throw new Error("orçamentos: defina ORCAMENTOS_COMPANY_ID (há mais de uma empresa, ou nenhuma).");
  empresa = data[0].id as string;
  return empresa;
}

export type Ponte = {
  /** Cliente do banco dos orçamentos (chave secreta: SEMPRE filtrar por companyId). */
  db: SupabaseClient;
  companyId: string;
  /** Cliente do RumoFácil com a sessão de quem chamou (passa pela RLS daqui). */
  supabase: NonNullable<Awaited<ReturnType<typeof sessao>>>["supabase"];
  userId: string;
};

/**
 * Abre a ponte pra uma rota: confere a sessão, a empresa ligada e a
 * configuração. Devolve a resposta de erro pronta quando não pode.
 */
export async function abrirPonte(): Promise<Ponte | Response> {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!orcamentosConfigurado())
    return erro("A ligação com o app de orçamentos ainda não está configurada.", 503);

  const { data: perfil } = await s.supabase
    .from("profiles")
    .select("household_id")
    .eq("id", s.userId)
    .maybeSingle();
  if (!casaLigada(perfil?.household_id)) return erro("Esta empresa não está ligada ao app de orçamentos.", 403);

  const db = bancoDosOrcamentos();
  try {
    return { db, companyId: await empresaDosOrcamentos(db), supabase: s.supabase, userId: s.userId };
  } catch (e) {
    return erro("Não deu para falar com o app de orçamentos.", 502, String(e));
  }
}

// ------------------------------------------------------------- validação

/** Texto opcional: aparado, cortado no tamanho, vazio vira nulo. */
export function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export const ehId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Colunas de cliente que o RumoFácil lê e grava (as mesmas do app de orçamentos). */
export const CAMPOS_CLIENTE = {
  name: 120,
  phone: 40,
  email: 120,
  doc: 30,
  cep: 12,
  street: 160,
  number: 20,
  complement: 80,
  district: 80,
  city: 80,
  uf: 2,
  notes: 1000,
} as const;

export const COLUNAS_CLIENTE =
  "id, code, name, phone, email, doc, cep, street, number, complement, district, city, uf, notes, created_at";

/** Do corpo do pedido, só os campos conhecidos, já limpos. */
export function clienteDoCorpo(corpo: Record<string, unknown>) {
  const saida: Record<string, string | null> = {};
  for (const [campo, max] of Object.entries(CAMPOS_CLIENTE)) {
    if (campo in corpo) saida[campo] = texto(corpo[campo], max);
  }
  if (saida.uf) saida.uf = saida.uf.toUpperCase();
  return saida;
}

export const COLUNAS_SERVICO = "id, kind, name, description, unit, price, includes, active, use_count";
