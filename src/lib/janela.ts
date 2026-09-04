import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ExpenseInWindowRow,
  IncomeInWindowRow,
  InvestmentInWindowRow,
} from "./types";

/**
 * A conta de uma janela qualquer de datas — normalmente o ciclo do cartão,
 * que vai do dia 14 ao 13 e por isso atravessa dois meses do calendário.
 *
 * Fica num lugar só porque a tela do ciclo e o início mostram o mesmo
 * número: se cada uma calculasse do seu jeito, uma hora elas discordariam
 * e ninguém saberia qual acreditar.
 */

export type TotaisDaJanela = {
  /** Tudo que entrou na janela. */
  income: number;
  /** Compras no cartão dentro da janela — é o que vira fatura. */
  card: number;
  /** Pix e transferência: já saíram da conta quando aconteceram. */
  other: number;
  investment: number;
  /** Entrou menos tudo que saiu. Este é o número que sobra de verdade. */
  leftover: number;
  expenses: ExpenseInWindowRow[];
};

export const JANELA_VAZIA: TotaisDaJanela = {
  income: 0,
  card: 0,
  other: 0,
  investment: 0,
  leftover: 0,
  expenses: [],
};

export async function carregarJanela(
  supabase: SupabaseClient,
  from: string,
  to: string,
  userIds: string[]
): Promise<TotaisDaJanela> {
  const [incomeResult, expenseResult, investmentResult] = await Promise.all([
    supabase.rpc("income_in_window", { p_from: from, p_to: to }),
    supabase.rpc("expenses_in_window", { p_from: from, p_to: to }),
    supabase.rpc("investments_in_window", { p_from: from, p_to: to }),
  ]);

  // Falhar calado aqui seria mostrar "sobrou R$ 0,00" como se fosse
  // verdade. Melhor a tela dizer que não conseguiu calcular.
  const falha =
    incomeResult.error ?? expenseResult.error ?? investmentResult.error;
  if (falha) throw falha;

  // Nenhuma leitura ignora o escopo: a RLS devolve a casa toda, o userIds
  // é o que separa "meu" de "nosso".
  const doEscopo = <T extends { user_id: string }>(linhas: T[] | null) =>
    (linhas ?? []).filter((linha) => userIds.includes(linha.user_id));

  const rendas = doEscopo(incomeResult.data as IncomeInWindowRow[] | null);
  const gastos = doEscopo(expenseResult.data as ExpenseInWindowRow[] | null);
  const aportes = doEscopo(
    investmentResult.data as InvestmentInWindowRow[] | null
  );

  const somar = (linhas: { amount: number }[]) =>
    linhas.reduce((total, linha) => total + Number(linha.amount), 0);

  const income = somar(rendas);
  const card = somar(gastos.filter((g) => g.payment_method === "card"));
  const other = somar(gastos.filter((g) => g.payment_method !== "card"));
  const investment = somar(aportes);

  return {
    income,
    card,
    other,
    investment,
    leftover: income - card - other - investment,
    expenses: gastos,
  };
}
