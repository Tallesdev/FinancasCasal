"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { Button, Dot, ErrorNote, Field, inputClass } from "./ui";
import { partesValidas } from "@/lib/divisao";
import type { ProfitShare } from "@/lib/types";

const firstName = (full: string) => full.split(" ")[0];

/**
 * Ajustes da empresa (FASE_F.md, F3.1 e F3.2): a % de cada sócio e quanto
 * fica de reserva antes de dividir. Quem salva é a função definir_divisao,
 * que confere a soma de 100% — aqui a conta é só pra avisar antes.
 */
export function DivisaoLucro() {
  const supabase = useMemo(() => createClient(), []);
  const { members, empresa } = useScope();

  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [reserva, setReserva] = useState("0");
  const [salvo, setSalvo] = useState<{ pcts: Record<string, string>; reserva: string } | null>(null);
  /** Falso enquanto a migração 015 não roda: o bloco nem aparece. */
  const [pronto, setPronto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const ids = useMemo(() => members.map((m) => m.id), [members]);

  const load = useCallback(async () => {
    if (!empresa) return;
    const [partesResult, casaResult] = await Promise.all([
      supabase.from("profit_shares").select("*"),
      supabase.from("households").select("reserve_pct").maybeSingle(),
    ]);
    if (partesResult.error || casaResult.error) return setPronto(false);
    const partes = partesValidas((partesResult.data ?? []) as ProfitShare[], ids);
    const p: Record<string, string> = {};
    for (const parte of partes) p[parte.user_id] = String(Math.round(parte.pct * 100) / 100);
    const r = String(Number(casaResult.data?.reserve_pct ?? 0));
    setPcts(p);
    setReserva(r);
    setSalvo({ pcts: p, reserva: r });
    setPronto(true);
  }, [supabase, empresa, ids]);

  useEffect(() => {
    load();
  }, [load]);

  if (!empresa || !pronto || members.length < 2) return null;

  const num = (v: string) => Number(v.replace(",", "."));
  const soma = ids.reduce((t, id) => t + (num(pcts[id] ?? "0") || 0), 0);
  const somaOk = Math.abs(soma - 100) < 0.01;
  const reservaOk = num(reserva) >= 0 && num(reserva) <= 100;
  const mudou =
    salvo !== null &&
    (reserva !== salvo.reserva || ids.some((id) => pcts[id] !== salvo.pcts[id]));

  async function salvar() {
    if (!somaOk || !reservaOk) return;
    setSaving(true);
    setError(null);
    setOk(false);
    const { error: e } = await supabase.rpc("definir_divisao", {
      p_reserva: num(reserva),
      p_partes: ids.map((id) => ({ user_id: id, pct: num(pcts[id] ?? "0") })),
    });
    setSaving(false);
    // As mensagens da função já vêm em português.
    if (e) return setError(e.message);
    setSalvo({ pcts, reserva });
    setOk(true);
  }

  return (
    <section className="card flex flex-col gap-5 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Divisão do lucro</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Quanto do lucro de cada mês é de cada sócio. Mês com prejuízo não divide.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((m) => (
          <Field key={m.id} label={firstName(m.display_name)}>
            <div className="flex items-center gap-2">
              <Dot color={m.color} />
              <input
                className={`${inputClass} money`}
                type="number"
                inputMode="decimal"
                min="0"
                max="100"
                step="0.01"
                value={pcts[m.id] ?? ""}
                onChange={(event) => setPcts({ ...pcts, [m.id]: event.target.value })}
              />
              <span className="text-sm text-[var(--color-text-dim)]">%</span>
            </div>
          </Field>
        ))}
      </div>

      <p className={`text-xs ${somaOk ? "text-[var(--color-text-faint)]" : "text-[var(--color-out)]"}`}>
        Soma: <span className="money">{Math.round(soma * 100) / 100}%</span>
        {somaOk ? "" : " — precisa dar 100%."}
      </p>

      <Field
        label="Reserva da empresa"
        hint="Sai do lucro antes de dividir e fica na empresa. 0% = divide tudo."
      >
        <div className="flex items-center gap-2">
          <input
            className={`${inputClass} money`}
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="0.01"
            value={reserva}
            onChange={(event) => setReserva(event.target.value)}
          />
          <span className="text-sm text-[var(--color-text-dim)]">%</span>
        </div>
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}
      {ok && !mudou && <p className="text-xs text-[var(--color-in)]">Divisão salva.</p>}

      <div>
        <Button onClick={salvar} disabled={saving || !mudou || !somaOk || !reservaOk}>
          {saving ? "Salvando…" : "Salvar divisão"}
        </Button>
      </div>
    </section>
  );
}
