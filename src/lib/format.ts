const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function money(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return brl.format(Number.isFinite(n) ? n : 0);
}

/** Para eixos de gráfico, onde o valor cheio não cabe. */
export function moneyShort(value: number) {
  return brlCompact.format(value);
}

export function percent(part: number, whole: number) {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const MONTHS_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

/** Aceita "2026-08-01" ou "2026-08" e devolve "Agosto". */
export function monthName(iso: string, short = false) {
  const index = Number(iso.slice(5, 7)) - 1;
  return (short ? MONTHS_SHORT : MONTHS)[index] ?? iso;
}

export function monthLabel(iso: string, short = false) {
  return `${monthName(iso, short)} ${iso.slice(0, 4)}`;
}

/** Data local no formato YYYY-MM-DD, sem o deslocamento de fuso do toISOString. */
export function toISODate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function firstDayOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: string, count: number) {
  const [y, m] = iso.split("-").map(Number);
  const date = new Date(y, m - 1 + count, 1);
  return toISODate(date);
}

/** Janela do ano inteiro para os relatórios anuais. */
export function yearRange(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-01` };
}

export function formatDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
