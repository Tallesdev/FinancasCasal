import { mesesDepois } from "./fatura";
import type { InstallmentAdvance } from "./types";

/**
 * Adiantar parcelas (C38). Conta pura, sem banco: a mesma regra das
 * funções da migração 025 — a parcela n cai no mesmo dia, n−1 meses depois
 * da primeira; adiantada, cai no dia em que foi paga.
 */

export type SituacaoParcela = "paga" | "adiantada" | "a vencer";

export type Parcela = {
  n: number;
  /** Quando cai: a data normal, ou a do adiantamento. */
  data: string;
  /** A data normal, mesmo se foi adiantada. */
  dataNormal: string;
  valor: number;
  situacao: SituacaoParcela;
  adiantamento: InstallmentAdvance | null;
};

export function parcelasDoGasto(
  gasto: { start_date: string; amount: number; installments_total: number | null },
  adiantamentos: InstallmentAdvance[],
  hoje: string
): Parcela[] {
  const total = gasto.installments_total ?? 1;
  const porNumero = new Map(adiantamentos.map((a) => [a.installment_number, a]));
  const lista: Parcela[] = [];
  for (let n = 1; n <= total; n++) {
    const dataNormal = mesesDepois(gasto.start_date.slice(0, 10), n - 1);
    const a = porNumero.get(n) ?? null;
    lista.push({
      n,
      data: a ? a.paid_on : dataNormal,
      dataNormal,
      valor: a ? Number(a.amount) : Number(gasto.amount),
      situacao: a ? "adiantada" : dataNormal <= hoje ? "paga" : "a vencer",
      adiantamento: a,
    });
  }
  return lista;
}

/** Divide o valor pago entre as parcelas, centavo a centavo (a sobra vai na última). */
export function dividirValor(total: number, partes: number): number[] {
  if (partes <= 0) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / partes);
  return Array.from({ length: partes }, (_, i) =>
    (i === partes - 1 ? centavos - base * (partes - 1) : base) / 100
  );
}

/** O que ainda falta depois de adiantar as escolhidas: quantas e quando é a última. */
export function faltamDepois(parcelas: Parcela[], escolhidas: Set<number>) {
  const restantes = parcelas.filter((p) => p.situacao === "a vencer" && !escolhidas.has(p.n));
  return {
    quantas: restantes.length,
    valor: Math.round(restantes.reduce((s, p) => s + p.valor, 0) * 100) / 100,
    ultima: restantes.length ? restantes[restantes.length - 1].data : null,
  };
}
