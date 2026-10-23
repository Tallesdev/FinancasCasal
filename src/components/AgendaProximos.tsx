"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { CartaoAtendimento } from "./CartaoAtendimento";
import { buscarAgenda, diaCurto, somarDias } from "@/lib/agenda";
import { toISODate } from "@/lib/format";
import type { Appointment } from "@/lib/types";

/** Quantos dias pra frente o Início mostra. */
const DIAS = 7;

/**
 * "Hoje e próximos dias" no Início da empresa (C29). É o que resolve o
 * "só sei do cliente quando o outro lembra de contar": abriu o app, viu.
 */
export function AgendaProximos() {
  const supabase = useMemo(() => createClient(), []);
  const { members } = useScope();
  const hoje = useMemo(() => toISODate(new Date()), []);
  const [lista, setLista] = useState<Appointment[] | null>(null);

  useEffect(() => {
    buscarAgenda(supabase, hoje, somarDias(hoje, DIAS - 1)).then(setLista);
  }, [supabase, hoje]);

  // Sem a migração (ou sem nada marcado) o quadro só não aparece.
  if (!lista) return null;
  const ativos = lista.filter((a) => a.status === "marcado");
  const membro = (id: string | null) => (id ? members.find((m) => m.id === id) : undefined);
  const deHoje = ativos.filter((a) => a.date === hoje).length;
  const mostrar = [...ativos]
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? "").localeCompare(b.start_time ?? ""))
    .slice(0, 5);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Agenda{" "}
          <span className="font-normal text-[var(--color-text-faint)]">
            · {deHoje ? `${deHoje} ${deHoje === 1 ? "cliente" : "clientes"} hoje` : "ninguém hoje"}
          </span>
        </h2>
        <Link href="/agenda" className="text-xs font-semibold text-[var(--scope)]">
          Ver agenda
        </Link>
      </div>
      {mostrar.length === 0 ? (
        <p className="card px-4 py-4 text-sm text-[var(--color-text-faint)]">
          Nenhum cliente marcado nos próximos {DIAS} dias.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mostrar.map((a) => (
            <li key={a.id}>
              <Link href="/agenda" className="block">
                <CartaoAtendimento
                  a={a}
                  atende={membro(a.assigned_to)}
                  marcou={membro(a.created_by)}
                  mostrarDia={diaCurto(a.date, hoje)}
                />
              </Link>
            </li>
          ))}
          {ativos.length > mostrar.length && (
            <li className="text-xs text-[var(--color-text-faint)]">
              e mais {ativos.length - mostrar.length} na semana.
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
