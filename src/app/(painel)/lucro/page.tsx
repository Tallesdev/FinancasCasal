"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import {
  Button,
  DeleteButton,
  Dot,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  PageTitle,
  Sheet,
  inputClass,
} from "@/components/ui";
import { formatDate, money, monthName, toISODate, yearRange } from "@/lib/format";
import { dividirMes, partesValidas, resumoDoAno } from "@/lib/divisao";
import type { MonthlySummaryRow, ProfitShare, Withdrawal } from "@/lib/types";

const firstName = (full: string) => full.split(" ")[0];

type Rascunho = {
  id: string | null;
  user_id: string;
  amount: string;
  taken_on: string;
  notes: string;
};

/**
 * Lucro e divisão (FASE_F.md, F3.3 a F3.5). Só empresa.
 * Sempre a empresa inteira: o seletor Talles/Joaquim/Empresa não muda o
 * lucro — ele é de todos, e a parte de cada um sai daqui.
 */
export default function LucroPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, members, empresa } = useScope();

  const [ano, setAno] = useState(() => new Date().getFullYear());
  const [summary, setSummary] = useState<MonthlySummaryRow[]>([]);
  const [salvas, setSalvas] = useState<ProfitShare[]>([]);
  const [reservaPct, setReservaPct] = useState(0);
  const [retiradas, setRetiradas] = useState<Withdrawal[]>([]);
  /** Falso enquanto a migração 015 não roda. */
  const [pronto, setPronto] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ids = useMemo(() => members.map((m) => m.id), [members]);
  const porId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const load = useCallback(async () => {
    if (!empresa) return;
    setLoading(true);
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

    if (resumo.error) {
      setError("Não deu para carregar o lucro do ano.");
      setLoading(false);
      return;
    }
    setError(null);
    setSummary(resumo.data as MonthlySummaryRow[]);
    const temMigracao = !partes.error && !casa.error && !saques.error;
    setPronto(temMigracao);
    setSalvas(temMigracao ? ((partes.data ?? []) as ProfitShare[]) : []);
    setReservaPct(temMigracao ? Number(casa.data?.reserve_pct ?? 0) : 0);
    setRetiradas(temMigracao ? ((saques.data ?? []) as Withdrawal[]) : []);
    setLoading(false);
  }, [supabase, empresa, ano]);

  useEffect(() => {
    load();
  }, [load]);

  const partes = useMemo(() => partesValidas(salvas, ids), [salvas, ids]);
  const divisaoDefinida = salvas.length > 0 && partes.every((p) => salvas.some((s) => s.user_id === p.user_id));

  /** Meses do ano até o mês atual (ano passado: os 12). */
  const meses = useMemo(() => {
    const hoje = toISODate(new Date());
    const ultimo = ano < Number(hoje.slice(0, 4)) ? 12 : ano > Number(hoje.slice(0, 4)) ? 0 : Number(hoje.slice(5, 7));
    const lista = [];
    for (let i = 1; i <= ultimo; i++) {
      const mes = `${ano}-${String(i).padStart(2, "0")}-01`;
      let faturou = 0;
      let gastou = 0;
      // Empresa inteira: soma todos os sócios, independente do seletor.
      for (const row of summary) {
        if (row.month.slice(0, 7) !== mes.slice(0, 7) || !ids.includes(row.user_id)) continue;
        faturou += Number(row.income);
        gastou += Number(row.expense) + Number(row.investment);
      }
      lista.push(dividirMes(mes, faturou, gastou, reservaPct, partes));
    }
    return lista;
  }, [ano, summary, ids, reservaPct, partes]);

  const resumo = useMemo(() => resumoDoAno(meses, partes, retiradas), [meses, partes, retiradas]);
  const mesesComMovimento = meses.filter((m) => m.faturou || m.gastou);

  function novaRetirada() {
    setRascunho({ id: null, user_id: me.id, amount: "", taken_on: toISODate(new Date()), notes: "" });
    setFormError(null);
  }

  async function salvar() {
    if (!rascunho) return;
    const amount = Number(rascunho.amount.replace(",", "."));
    if (!ids.includes(rascunho.user_id)) return setFormError("Escolha quem retirou.");
    if (!Number.isFinite(amount) || amount <= 0) return setFormError("Informe um valor maior que zero.");
    if (!rascunho.taken_on) return setFormError("Escolha a data.");

    const payload = {
      user_id: rascunho.user_id,
      amount,
      taken_on: rascunho.taken_on,
      notes: rascunho.notes.trim() || null,
    };
    setSaving(true);
    setFormError(null);
    const { error: e } = rascunho.id
      ? await supabase.from("withdrawals").update(payload).eq("id", rascunho.id)
      : await supabase.from("withdrawals").insert(payload);
    setSaving(false);
    if (e) return setFormError("Não deu para salvar a retirada. Tente de novo.");
    setRascunho(null);
    load();
  }

  async function apagar(id: string) {
    await supabase.from("withdrawals").delete().eq("id", id);
    load();
  }

  if (!empresa) {
    return (
      <EmptyState
        title="Só para empresa"
        description="Lucro e divisão entre sócios aparece nas contas do tipo Empresa."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Lucro e divisão"
        description="O lucro de cada mês e quanto coube a cada sócio."
        action={
          <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1">
            <button
              type="button"
              aria-label="Ano anterior"
              onClick={() => setAno(ano - 1)}
              className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              &lsaquo;
            </button>
            <span className="min-w-[4rem] text-center text-sm font-medium">{ano}</span>
            <button
              type="button"
              aria-label="Próximo ano"
              onClick={() => setAno(ano + 1)}
              className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              &rsaquo;
            </button>
          </div>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {members.length > 1 && (
        <Link
          href="/acerto"
          className="card flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:border-[var(--scope)]"
        >
          <span>
            <span className="font-medium">Acerto entre sócios</span>
            <span className="block text-xs text-[var(--color-text-faint)]">
              Gasto pago do bolso e cliente que pagou na conta de um sócio.
            </span>
          </span>
          <span aria-hidden="true" className="text-[var(--color-text-faint)]">&rsaquo;</span>
        </Link>
      )}

      {!pronto && (
        <ErrorNote>
          A divisão e as retiradas ainda não estão ligadas no banco (migração 015). O lucro do
          mês aparece, dividido igual entre os sócios.
        </ErrorNote>
      )}

      {pronto && !divisaoDefinida && members.length > 1 && (
        <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-text-dim)]">
          A divisão ainda não foi definida, então está igual entre os sócios.{" "}
          <Link href="/ajustes" className="underline">
            Definir em Ajustes
          </Link>
          .
        </p>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {/* Cada sócio: quanto coube no ano, quanto já tirou, quanto falta. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {resumo.socios.map((s) => {
              const pessoa = porId.get(s.user_id);
              return (
                <div key={s.user_id} className="card flex flex-col gap-3 px-4 py-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <Dot color={pessoa?.color ?? null} />
                    {pessoa ? firstName(pessoa.display_name) : "Sócio"}
                    <span className="text-xs font-normal text-[var(--color-text-faint)]">
                      {Math.round(s.pct * 100) / 100}%
                    </span>
                  </p>
                  <dl className="grid grid-cols-3 gap-2 text-xs text-[var(--color-text-faint)]">
                    <div>
                      <dt>Coube no ano</dt>
                      <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                        {money(s.direito)}
                      </dd>
                    </div>
                    <div>
                      <dt>Retirou</dt>
                      <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                        {money(s.retirado)}
                      </dd>
                    </div>
                    <div>
                      <dt>{s.falta < 0 ? "Tirou a mais" : "Falta retirar"}</dt>
                      <dd
                        className="money mt-0.5 text-sm font-semibold"
                        style={{ color: s.falta < 0 ? "var(--color-out)" : "var(--color-in)" }}
                      >
                        {money(Math.abs(s.falta))}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="card grid grid-cols-3 gap-2 px-4 py-4 text-xs text-[var(--color-text-faint)]">
            <div>
              <p>Lucro do ano</p>
              <p className="money mt-0.5 text-base font-semibold text-[var(--color-in)]">
                {money(resumo.lucroDoAno)}
              </p>
            </div>
            <div>
              <p>Reserva ({Math.round(reservaPct * 100) / 100}%)</p>
              <p className="money mt-0.5 text-base font-semibold text-[var(--color-text)]">
                {money(resumo.reservaDoAno)}
              </p>
            </div>
            <div>
              <p>Prejuízo do ano</p>
              <p
                className="money mt-0.5 text-base font-semibold"
                style={{ color: resumo.prejuizoDoAno > 0 ? "var(--color-out)" : "var(--color-text)" }}
              >
                {money(resumo.prejuizoDoAno)}
              </p>
            </div>
          </div>

          {/* Mês a mês, do mais recente pro mais antigo. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Mês a mês
            </h2>
            {mesesComMovimento.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">Nenhum lançamento em {ano}.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...mesesComMovimento].reverse().map((m) => (
                  <li key={m.mes} className="card flex flex-col gap-2 px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium">{monthName(m.mes)}</p>
                      <p
                        className="money font-semibold"
                        style={{ color: m.lucro < 0 ? "var(--color-out)" : "var(--color-in)" }}
                      >
                        {m.lucro < 0 ? `− ${money(-m.lucro)}` : money(m.lucro)}
                      </p>
                    </div>
                    <p className="text-xs text-[var(--color-text-faint)]">
                      Faturou <span className="money">{money(m.faturou)}</span> · gastou{" "}
                      <span className="money">{money(m.gastou)}</span>
                    </p>
                    {m.lucro < 0 ? (
                      <p className="text-xs font-medium text-[var(--color-out)]">
                        Fechou com prejuízo: não divide e não desconta do mês seguinte.
                      </p>
                    ) : m.lucro > 0 ? (
                      <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-dim)]">
                        {m.reserva > 0 && (
                          <span>
                            Reserva <span className="money">{money(m.reserva)}</span>
                          </span>
                        )}
                        {partes.map((p) => (
                          <span key={p.user_id} className="inline-flex items-center gap-1">
                            <Dot color={porId.get(p.user_id)?.color ?? null} />
                            {firstName(porId.get(p.user_id)?.display_name ?? "Sócio")}{" "}
                            <span className="money">{money(m.partes[p.user_id] ?? 0)}</span>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Retiradas (F3.5). */}
          {pronto && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
                  Retiradas em {ano}
                </h2>
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={novaRetirada}>
                  Nova retirada
                </Button>
              </div>
              {retiradas.length === 0 ? (
                <p className="text-sm text-[var(--color-text-dim)]">
                  Ninguém registrou retirada em {ano}.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {retiradas.map((r) => {
                    const pessoa = porId.get(r.user_id);
                    return (
                      <li key={r.id} className="card flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            <Dot color={pessoa?.color ?? null} />
                            {pessoa ? firstName(pessoa.display_name) : "Ex-sócio"}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
                            {formatDate(r.taken_on)}
                            {r.notes ? ` · ${r.notes}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="money font-semibold">{money(r.amount)}</span>
                          <span className="flex items-center gap-1">
                            <Button
                              variant="quiet"
                              className="px-2 py-0.5 text-xs"
                              onClick={() => {
                                setRascunho({
                                  id: r.id,
                                  user_id: r.user_id,
                                  amount: String(r.amount),
                                  taken_on: r.taken_on.slice(0, 10),
                                  notes: r.notes ?? "",
                                });
                                setFormError(null);
                              }}
                            >
                              Editar
                            </Button>
                            <DeleteButton onConfirm={() => apagar(r.id)} />
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {rascunho && (
        <Sheet
          title={rascunho.id ? "Editar retirada" : "Nova retirada"}
          onClose={() => setRascunho(null)}
        >
          <div className="flex flex-col gap-4">
            <Field label="Quem retirou">
              <select
                className={inputClass}
                value={rascunho.user_id}
                onChange={(event) => setRascunho({ ...rascunho, user_id: event.target.value })}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Valor">
              <input
                className={`${inputClass} money`}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0,00"
                autoFocus
                value={rascunho.amount}
                onChange={(event) => setRascunho({ ...rascunho, amount: event.target.value })}
              />
            </Field>

            <Field label="Data">
              <input
                className={inputClass}
                type="date"
                value={rascunho.taken_on}
                onChange={(event) => setRascunho({ ...rascunho, taken_on: event.target.value })}
              />
            </Field>

            <Field label="Observação" hint="Opcional">
              <input
                className={inputClass}
                maxLength={200}
                value={rascunho.notes}
                onChange={(event) => setRascunho({ ...rascunho, notes: event.target.value })}
              />
            </Field>

            {formError && <ErrorNote>{formError}</ErrorNote>}

            <div className="mt-2 flex gap-2">
              <Button onClick={salvar} disabled={saving} className="flex-1">
                {saving ? "Salvando…" : "Salvar retirada"}
              </Button>
              <Button variant="ghost" onClick={() => setRascunho(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
