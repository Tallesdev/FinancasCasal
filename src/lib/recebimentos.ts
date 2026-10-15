import { addMonths, firstDayOfMonth } from "./format";
import type { Income, IncomeReceived } from "./types";

/**
 * Recebimentos da empresa (FASE_F.md, F2). Tudo aqui é conta pura, sem
 * banco: as telas carregam incomes + income_received e chamam isto.
 *
 * Regras:
 *  - Cada recebimento acontece em meses (YYYY-MM-01): à vista num mês só,
 *    parcelado em N meses seguidos, "todo mês" do início até o fim.
 *  - Um mês está recebido quando tem linha em income_received.
 *  - "A receber" = meses sem linha. Atrasado = mês já passou.
 *  - Caixa conta o dinheiro pelo dia em que caiu (received_on).
 */

/** Quantos meses pra frente "A receber" olha. Parcelas depois disso não somem: só não aparecem ainda. */
export const HORIZONTE_MESES = 12;

const mesDe = (iso: string) => firstDayOfMonth(iso);

/** Último mês do recebimento; nulo = "todo mês" sem fim. */
function ultimoMes(income: Income): string | null {
  if (income.kind === "one_time") return mesDe(income.start_date);
  return income.end_date ? mesDe(income.end_date) : null;
}

/** Os meses do recebimento, do primeiro até `ate` (inclusive). */
export function mesesDe(income: Income, ate: string): string[] {
  const fim = ultimoMes(income);
  const limite = fim && fim < ate ? fim : mesDe(ate);
  const meses: string[] = [];
  for (let m = mesDe(income.start_date); m <= limite; m = addMonths(m, 1)) {
    meses.push(m);
    if (meses.length > 240) break; // 20 anos: proteção contra data maluca
  }
  return meses;
}

/** "Parcela 2 de 5". Nulo quando não é parcelado. */
export function numeroDaParcela(income: Income, mes: string): number | null {
  if (!income.installments_total) return null;
  const [ya, ma] = mesDe(income.start_date).split("-").map(Number);
  const [yb, mb] = mes.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma) + 1;
}

/** Um mês vale pra esse recebimento? (Edição pode deixar marcação sobrando.) */
function mesValido(income: Income, mes: string): boolean {
  if (mes < mesDe(income.start_date)) return false;
  const fim = ultimoMes(income);
  return fim === null || mes <= fim;
}

const chave = (incomeId: string, mes: string) => `${incomeId}|${mes}`;

export function conjuntoRecebido(recebidos: IncomeReceived[]): Set<string> {
  return new Set(recebidos.map((r) => chave(r.income_id, mesDe(r.month))));
}

export type Pendencia = {
  income: Income;
  mes: string;
  parcela: number | null;
  valor: number;
  atrasado: boolean;
};

/**
 * O que ainda não entrou: atrasados + mês atual + próximos meses.
 * "Todo mês" sem fim só vai até o mês atual — senão a lista seria infinita.
 */
export function aReceber(
  incomes: Income[],
  recebidos: IncomeReceived[],
  hoje: string
): Pendencia[] {
  const mesAtual = mesDe(hoje);
  const horizonte = addMonths(mesAtual, HORIZONTE_MESES);
  const feito = conjuntoRecebido(recebidos);
  const lista: Pendencia[] = [];

  for (const income of incomes) {
    const ate = ultimoMes(income) === null ? mesAtual : horizonte;
    for (const mes of mesesDe(income, ate)) {
      if (feito.has(chave(income.id, mes))) continue;
      lista.push({
        income,
        mes,
        parcela: numeroDaParcela(income, mes),
        valor: Number(income.amount),
        atrasado: mes < mesAtual,
      });
    }
  }

  return lista.sort(
    (a, b) => a.mes.localeCompare(b.mes) || a.income.source.localeCompare(b.income.source)
  );
}

/** Quanto já caiu na conta até o dia `ateDia` (inclusive), pelo dia em que caiu. */
export function recebidoAte(
  incomes: Income[],
  recebidos: IncomeReceived[],
  ateDia: string
): number {
  const porId = new Map(incomes.map((i) => [i.id, i]));
  let total = 0;
  for (const r of recebidos) {
    const income = porId.get(r.income_id);
    if (!income || !mesValido(income, mesDe(r.month))) continue;
    if (r.received_on.slice(0, 10) > ateDia) continue;
    total += Number(income.amount);
  }
  return total;
}

/** Do que foi faturado num mês, quanto já entrou. */
export function recebidoDoMes(
  incomes: Income[],
  recebidos: IncomeReceived[],
  mes: string
): number {
  const porId = new Map(incomes.map((i) => [i.id, i]));
  let total = 0;
  for (const r of recebidos) {
    if (mesDe(r.month) !== mes) continue;
    const income = porId.get(r.income_id);
    if (income && mesValido(income, mes)) total += Number(income.amount);
  }
  return total;
}

/** Parcelas recebidas de um recebimento parcelado. */
export function parcelasRecebidas(income: Income, recebidos: IncomeReceived[]): number {
  return recebidos.filter(
    (r) => r.income_id === income.id && mesValido(income, mesDe(r.month))
  ).length;
}
