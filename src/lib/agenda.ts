import type { SupabaseClient } from "@supabase/supabase-js";
import { toISODate } from "./format";
import type { Appointment } from "./types";

/**
 * Agenda da empresa (C29). Mora no banco do RumoFácil; a RLS da migração
 * 023 mostra só os atendimentos da empresa de quem está logado.
 */

export async function buscarAgenda(
  supabase: SupabaseClient,
  de: string,
  ate: string
): Promise<Appointment[] | null> {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .gte("date", de)
    .lte("date", ate)
    .order("date")
    .order("start_time", { ascending: true, nullsFirst: true });
  return error ? null : (data as Appointment[]);
}

/** Do mais cedo pro mais tarde; sem horário vem primeiro (o dia todo). */
export function ordenarDoDia(lista: Appointment[]) {
  return [...lista].sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
}

/** "08:30:00" → "08:30". */
export const hora = (t: string | null) => (t ? t.slice(0, 5) : null);

export function faixaDeHorario(a: Pick<Appointment, "start_time" | "end_time">) {
  const ini = hora(a.start_time);
  const fim = hora(a.end_time);
  if (ini && fim) return `${ini}–${fim}`;
  return ini ?? (fim ? `até ${fim}` : null);
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
export const INICIAIS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const deISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** "Quinta, 23 de outubro" */
export function diaPorExtenso(iso: string) {
  const d = deISO(iso);
  const dia = DIAS_SEMANA[d.getDay()];
  return `${dia[0].toUpperCase()}${dia.slice(1)}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** "hoje", "amanhã" ou "quinta, 23/10". */
export function diaCurto(iso: string, hoje: string) {
  if (iso === hoje) return "hoje";
  if (iso === somarDias(hoje, 1)) return "amanhã";
  const d = deISO(iso);
  return `${DIAS_SEMANA[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function somarDias(iso: string, dias: number) {
  const d = deISO(iso);
  d.setDate(d.getDate() + dias);
  return toISODate(d);
}

/**
 * As semanas do mês para a grade, de domingo a sábado. Dia de fora do mês
 * vem nulo (célula vazia), como num calendário de parede.
 */
export function semanasDoMes(primeiroDia: string): (string | null)[][] {
  const inicio = deISO(primeiroDia);
  const ano = inicio.getFullYear();
  const mes = inicio.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const celulas: (string | null)[] = Array(inicio.getDay()).fill(null);
  for (let d = 1; d <= diasNoMes; d++) celulas.push(toISODate(new Date(ano, mes, d)));
  while (celulas.length % 7) celulas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  return semanas;
}

/** Último dia do mês (AAAA-MM-DD). */
export function ultimoDiaDoMes(primeiroDia: string) {
  const d = deISO(primeiroDia);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
