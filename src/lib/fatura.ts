/**
 * Em que fatura do cartão cai uma data (C36). A mesma conta de
 * card_cycle_bounds (migração 001), do lado da tela, pra prévia do
 * parcelado dizer as faturas em vez de só os meses do calendário.
 *
 * Fechamento no dia 13: compra em 11/08 fecha em 13/08; em 20/08, só em
 * 13/09. O próprio dia do fechamento ainda é da fatura que fecha nele.
 */

/** O dia no mês, sem passar do último (fechamento 31 vira 28 em fevereiro). */
function diaNoMes(ano: number, mes: number, dia: number) {
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const d = new Date(ano, mes, Math.min(dia, ultimo));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const partes = (iso: string) => iso.split("-").map(Number) as [number, number, number];

/** A mesma data, `meses` depois (dia 31 vira o último dia do mês). */
export function mesesDepois(iso: string, meses: number) {
  const [y, m, d] = partes(iso);
  return diaNoMes(y, m - 1 + meses, d);
}

export function faturaDe(
  data: string,
  fechamento: number,
  vencimento: number | null
): { fecha: string; vence: string | null } {
  const [y, m] = partes(data);
  const nesteMes = diaNoMes(y, m - 1, fechamento);
  const fecha = nesteMes >= data ? nesteMes : diaNoMes(y, m, fechamento);
  if (!vencimento) return { fecha, vence: null };
  const [fy, fm] = partes(fecha);
  const venceNoMes = diaNoMes(fy, fm - 1, vencimento);
  return { fecha, vence: venceNoMes >= fecha ? venceNoMes : diaNoMes(fy, fm, vencimento) };
}
