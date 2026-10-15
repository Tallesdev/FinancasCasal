import type { SupabaseClient } from "@supabase/supabase-js";
import { firstDayOfMonth, yearRange } from "./format";
import type {
  BankAccount,
  Card,
  Category,
  CategoryRankingRow,
  Expense,
  ExpenseOccurrence,
  Income,
  IncomeReceived,
  Investment,
  MonthlySummaryRow,
  ProfitShare,
  Receipt,
  Settlement,
  Withdrawal,
} from "./types";

/* =====================================================================
   O que cada tela principal busca no banco (FASE_F.md, F8.6).

   Fica fora das telas pra servir a dois: a própria tela, e o pré-carregamento
   (components/PreCarregar.tsx), que busca as outras abas por trás logo que o
   app abre. Assim a primeira visita a cada aba também já abre pronta.

   Cada função devolve o que a tela guarda (lib/guardado.ts), ou null se a
   consulta principal falhou.
   ===================================================================== */

// --------------------------------------------------------------- Início

/** O mês do Início. */
export type MesGuardado = {
  summary: MonthlySummaryRow[];
  occurrences: ExpenseOccurrence[];
  incomes: Income[];
  /** Nulo = migração 014 não rodou (ou não é empresa): volta o saldo acumulado. */
  recebidos: IncomeReceived[] | null;
  retiradas: Withdrawal[];
  pagoDoBolso: number;
  acertos: Settlement[];
};

export async function buscarInicioMes(
  supabase: SupabaseClient,
  { month, empresa }: { month: string; empresa: boolean }
): Promise<MesGuardado | null> {
  // Desde uma época bem antiga até o mês visto: o gráfico só usa os
  // últimos 6 meses, mas o saldo acumulado precisa de tudo que já foi
  // lançado. Cada linha é limitada pela própria data do lançamento, então
  // isso não pesa a consulta.
  const from = "2000-01-01";

  // Tudo numa ida só ao banco (antes a empresa fazia duas, uma depois da
  // outra, antes da do "pago do bolso").
  const [
    summaryResult,
    occurrencesResult,
    incomesResult,
    recebidosResult,
    retiradasResult,
    bolsoResult,
    acertosResult,
  ] = await Promise.all([
    supabase.rpc("monthly_summary", { p_from: from, p_to: month }),
    supabase.rpc("expense_occurrences", { p_from: month, p_to: month }),
    empresa ? supabase.from("incomes").select("*") : null,
    empresa ? supabase.from("income_received").select("*") : null,
    // Retiradas saem do caixa (migração 015; sem ela, fica zero).
    empresa ? supabase.from("withdrawals").select("amount, taken_on") : null,
    // Acerto (migração 016): o caixa é a conta da empresa, então gasto pago
    // do bolso de um sócio não sai dele, e acerto com a empresa entra ou
    // sai. Sem a 016, estas duas dão erro e o caixa fica como antes.
    empresa ? supabase.from("expenses").select("id, start_date").not("paid_by", "is", null) : null,
    empresa ? supabase.from("settlements").select("from_user, to_user, amount, paid_on") : null,
  ]);

  // Pago do bolso: só dá pra somar depois de saber desde quando buscar.
  let pagoDoBolso = 0;
  const doBolso = bolsoResult && !bolsoResult.error ? (bolsoResult.data ?? []) : [];
  if (doBolso.length) {
    const ids = new Set(doBolso.map((e) => e.id as string));
    const inicio = doBolso.map((e) => e.start_date as string).sort()[0];
    const { data } = await supabase.rpc("expense_occurrences", {
      p_from: firstDayOfMonth(inicio),
      p_to: month,
    });
    pagoDoBolso = ((data ?? []) as ExpenseOccurrence[])
      .filter((o) => ids.has(o.expense_id))
      .reduce((t, o) => t + Number(o.amount), 0);
  }

  if (summaryResult.error || occurrencesResult.error) return null;

  return {
    summary: summaryResult.data as MonthlySummaryRow[],
    occurrences: occurrencesResult.data as ExpenseOccurrence[],
    incomes: (incomesResult?.data ?? []) as Income[],
    recebidos:
      recebidosResult && !recebidosResult.error
        ? ((recebidosResult.data ?? []) as IncomeReceived[])
        : null,
    retiradas:
      retiradasResult && !retiradasResult.error ? ((retiradasResult.data ?? []) as Withdrawal[]) : [],
    pagoDoBolso,
    acertos: acertosResult && !acertosResult.error ? ((acertosResult.data ?? []) as Settlement[]) : [],
  };
}

/** Cartões e categorias do Início, que mudam pouco. */
export type BaseGuardada = { cards: Card[]; categories: Category[] };

export async function buscarInicioBase(
  supabase: SupabaseClient,
  meId: string
): Promise<BaseGuardada> {
  const [cardsResult, categoriesResult] = await Promise.all([
    supabase
      .from("cards")
      .select("*")
      .eq("user_id", meId)
      .eq("archived", false)
      .order("name"),
    supabase.from("categories").select("*"),
  ]);
  return {
    cards: (cardsResult.data ?? []) as Card[],
    categories: (categoriesResult.data ?? []) as Category[],
  };
}

// --------------------------------------------------------------- Gastos

export type GastosGuardados = {
  occurrences: ExpenseOccurrence[];
  expenses: Record<string, Expense>;
  categories: Category[];
  cards: Card[];
  accounts: BankAccount[];
  /** Recibos por gasto — pro clipe na lista e pra abrir na edição. */
  recibosPorGasto: Record<string, Receipt[]>;
};

export async function buscarGastos(
  supabase: SupabaseClient,
  {
    month,
    meId,
    empresa,
    recibos,
  }: { month: string; meId: string; empresa: boolean; recibos: boolean }
): Promise<GastosGuardados | null> {
  // Família: recibos só os meus. Empresa: os dos sócios também (migração
  // 018), pra o clipe aparecer no gasto de quem quer que tenha lançado.
  let recibosConsulta = supabase
    .from("receipts")
    .select("id, expense_id, mime_type, size_bytes, occurred_on, notes, uploaded_at, created_at")
    .not("expense_id", "is", null)
    .not("uploaded_at", "is", null);
  if (!empresa) recibosConsulta = recibosConsulta.eq("user_id", meId);

  const [
    occurrencesResult,
    expensesResult,
    categoriesResult,
    cardsResult,
    accountsResult,
    recibosResult,
  ] = await Promise.all([
    // A lista do mês vem da projeção, não da tabela crua: assim os fixos
    // aparecem no mês certo e o parcelado sabe que parcela é.
    supabase.rpc("expense_occurrences", { p_from: month, p_to: month }),
    supabase.from("expenses").select("*"),
    supabase.from("categories").select("*"),
    // Sem filtro de dono: quem decide é a RLS. Na família cartão e conta
    // são privados (voltam só os meus); na empresa voltam os dos sócios,
    // porque a conta da empresa está no nome de um deles (migração 011).
    supabase.from("cards").select("*"),
    supabase.from("bank_accounts").select("*").eq("archived", false).order("name"),
    // Junto com o resto (antes era uma segunda ida ao banco, depois).
    recibos ? recibosConsulta : null,
  ]);

  if (occurrencesResult.error) return null;

  const expenses: Record<string, Expense> = {};
  for (const row of (expensesResult.data ?? []) as Expense[]) expenses[row.id] = row;

  const recibosPorGasto: Record<string, Receipt[]> = {};
  for (const r of (recibosResult?.data ?? []) as Receipt[]) {
    (recibosPorGasto[r.expense_id!] ??= []).push(r);
  }

  return {
    occurrences: occurrencesResult.data as ExpenseOccurrence[],
    expenses,
    categories: (categoriesResult.data ?? []) as Category[],
    cards: (cardsResult.data ?? []) as Card[],
    accounts: (accountsResult.data ?? []) as BankAccount[],
    recibosPorGasto,
  };
}

// ------------------------------------------------------ Renda / Recebidos

export type RecebidosGuardados = {
  recebidos: IncomeReceived[];
  /** Falso enquanto a migração 014 não roda: some tudo que depende de "recebido". */
  recebidosOk: boolean;
};

export async function buscarRecebidos(
  supabase: SupabaseClient,
  empresa: boolean
): Promise<RecebidosGuardados> {
  if (!empresa) return { recebidos: [], recebidosOk: false };
  const { data, error } = await supabase.from("income_received").select("*");
  return {
    recebidos: error ? [] : ((data ?? []) as IncomeReceived[]),
    recebidosOk: !error,
  };
}

export type RendaGuardada = RecebidosGuardados & { incomes: Income[] };

export async function buscarRenda(
  supabase: SupabaseClient,
  empresa: boolean
): Promise<RendaGuardada | null> {
  const [{ data, error }, marcados] = await Promise.all([
    supabase.from("incomes").select("*").order("start_date", { ascending: false }),
    buscarRecebidos(supabase, empresa),
  ]);
  if (error) return null;
  return { incomes: data as Income[], ...marcados };
}

// ---------------------------------------------------------- Investimentos

export async function buscarInvestimentos(
  supabase: SupabaseClient
): Promise<Investment[] | null> {
  const { data, error } = await supabase
    .from("investments")
    .select("*")
    .order("start_date", { ascending: false });
  return error ? null : (data as Investment[]);
}

// ------------------------------------------------------------- Relatórios

export type RelatorioGuardado = {
  summary: MonthlySummaryRow[];
  ranking: CategoryRankingRow[];
};

export async function buscarRelatorio(
  supabase: SupabaseClient,
  year: number
): Promise<RelatorioGuardado | null> {
  const { from, to } = yearRange(year);
  const [summaryResult, rankingResult] = await Promise.all([
    supabase.rpc("monthly_summary", { p_from: from, p_to: to }),
    supabase.rpc("category_ranking", { p_from: from, p_to: to }),
  ]);
  if (summaryResult.error || rankingResult.error) return null;
  return {
    summary: summaryResult.data as MonthlySummaryRow[],
    ranking: rankingResult.data as CategoryRankingRow[],
  };
}

// ------------------------------------------------------- Lucro (empresa)

export type LucroGuardado = {
  summary: MonthlySummaryRow[];
  /** Falso enquanto a migração 015 não roda. */
  pronto: boolean;
  salvas: ProfitShare[];
  reservaPct: number;
  retiradas: Withdrawal[];
};

export async function buscarLucro(
  supabase: SupabaseClient,
  ano: number
): Promise<LucroGuardado | null> {
  const { from } = yearRange(ano);
  const [resumo, partes, casa, saques] = await Promise.all([
    supabase.rpc("monthly_summary", { p_from: from, p_to: `${ano}-12-31` }),
    supabase.from("profit_shares").select("*"),
    supabase.from("households").select("reserve_pct").maybeSingle(),
    supabase
      .from("withdrawals")
      .select("*")
      .gte("taken_on", from)
      .lte("taken_on", `${ano}-12-31`)
      .order("taken_on", { ascending: false }),
  ]);
  if (resumo.error) return null;
  const pronto = !partes.error && !casa.error && !saques.error;
  return {
    summary: resumo.data as MonthlySummaryRow[],
    pronto,
    salvas: pronto ? ((partes.data ?? []) as ProfitShare[]) : [],
    reservaPct: pronto ? Number(casa.data?.reserve_pct ?? 0) : 0,
    retiradas: pronto ? ((saques.data ?? []) as Withdrawal[]) : [],
  };
}

// ---------------------------------- Lucro por cliente (Relatórios, empresa)

export type GastoComCliente = {
  expense_id: string;
  client: string | null;
  amount: number;
  description: string;
  month: string;
};

export type LucroPorClienteGuardado = { incomes: Income[]; gastos: GastoComCliente[] };

/** `ids`: os sócios — a empresa inteira, como na tela Lucro. */
export async function buscarLucroPorCliente(
  supabase: SupabaseClient,
  ano: number,
  ids: string[]
): Promise<LucroPorClienteGuardado | null> {
  const [incomesResult, expensesResult, ocorrenciasResult] = await Promise.all([
    supabase.from("incomes").select("*"),
    supabase.from("expenses").select("id, user_id, client"),
    supabase.rpc("expense_occurrences", { p_from: `${ano}-01-01`, p_to: `${ano}-12-31` }),
  ]);
  if (incomesResult.error || expensesResult.error || ocorrenciasResult.error) return null;
  const clientePorGasto = new Map(
    ((expensesResult.data ?? []) as { id: string; user_id: string; client: string | null }[])
      .filter((e) => ids.includes(e.user_id))
      .map((e) => [e.id, e.client ?? null])
  );
  return {
    incomes: ((incomesResult.data ?? []) as Income[]).filter((i) => ids.includes(i.user_id)),
    gastos: ((ocorrenciasResult.data ?? []) as ExpenseOccurrence[])
      .filter((o) => clientePorGasto.has(o.expense_id))
      .map((o) => ({
        expense_id: o.expense_id,
        client: clientePorGasto.get(o.expense_id) ?? null,
        amount: Number(o.amount),
        description: o.description,
        month: o.month,
      })),
  };
}
