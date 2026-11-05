"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { useLucro } from "@/components/useLucro";
import {
  Button,
  DeleteButton,
  Dot,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  MonthNav,
  PageTitle,
  Sheet,
  inputClass,
} from "@/components/ui";
import { firstDayOfMonth, formatDate, money, monthLabel, monthName, toISODate } from "@/lib/format";
import { resumoDoMes } from "@/lib/divisao";

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
 * Mês a mês (C39): é o que os sócios usam pra dividir. O ano inteiro, pra
 * ter noção, fica em Relatórios (LucroDoAno).
 * Sempre a empresa inteira: o seletor Talles/Joaquim/Empresa não muda o
 * lucro — ele é de todos, e a parte de cada um sai daqui.
 */
export default function LucroPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, members, empresa } = useScope();

  const [mes, setMes] = useState(() => firstDayOfMonth(toISODate(new Date())));
  const ano = Number(mes.slice(0, 4));
  const { loading, error, load, pronto, partes, divisaoDefinida, reservaPct, retiradas, meses } =
    useLucro(ano);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ids = useMemo(() => members.map((m) => m.id), [members]);
  const porId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const { dividido, socios } = useMemo(
    () => resumoDoMes(meses, mes, partes, retiradas),
    [meses, mes, partes, retiradas]
  );
  const retiradasDoMes = retiradas.filter((r) => r.taken_on.slice(0, 7) === mes.slice(0, 7));
  const futuro = mes.slice(0, 7) > toISODate(new Date()).slice(0, 7);

  function novaRetirada() {
    const hoje = toISODate(new Date());
    // Mês antigo aberto: a retirada nasce no mês que a pessoa está vendo.
    const data = hoje.slice(0, 7) === mes.slice(0, 7) ? hoje : mes;
    setRascunho({ id: null, user_id: me.id, amount: "", taken_on: data, notes: "" });
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
        description="O lucro do mês e quanto coube a cada sócio. O ano inteiro está em Relatórios."
        action={<MonthNav month={mes} onChange={setMes} />}
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
      ) : futuro ? (
        <p className="text-sm text-[var(--color-text-dim)]">
          {monthLabel(mes)} ainda não chegou: o lucro aparece quando o mês começar.
        </p>
      ) : (
        <>
          {/* O mês: faturou, gastou, lucro e reserva. */}
          <div className="card flex flex-col gap-3 px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm text-[var(--color-text-faint)]">Lucro de {monthName(mes).toLowerCase()}</p>
              <p
                className="money text-xl font-semibold"
                style={{ color: (dividido?.lucro ?? 0) < 0 ? "var(--color-out)" : "var(--color-in)" }}
              >
                {(dividido?.lucro ?? 0) < 0 ? `− ${money(-(dividido?.lucro ?? 0))}` : money(dividido?.lucro ?? 0)}
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs text-[var(--color-text-faint)]">
              <div>
                <dt>Faturou</dt>
                <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                  {money(dividido?.faturou ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Gastou</dt>
                <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                  {money(dividido?.gastou ?? 0)}
                </dd>
              </div>
              <div>
                <dt>Reserva ({Math.round(reservaPct * 100) / 100}%)</dt>
                <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                  {money(dividido?.reserva ?? 0)}
                </dd>
              </div>
            </dl>
            {(dividido?.lucro ?? 0) < 0 && (
              <p className="text-xs font-medium text-[var(--color-out)]">
                Fechou com prejuízo: não divide e não desconta do mês seguinte.
              </p>
            )}
          </div>

          {/* Cada sócio: quanto coube no mês, quanto tirou no mês e o saldo até aqui. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {socios.map((s) => {
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
                      <dt>Coube no mês</dt>
                      <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                        {money(s.coube)}
                      </dd>
                    </div>
                    <div>
                      <dt>Retirou no mês</dt>
                      <dd className="money mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                        {money(s.retirouNoMes)}
                      </dd>
                    </div>
                    <div>
                      <dt>{s.saldo < 0 ? "Tirou a mais" : "Falta retirar"}</dt>
                      <dd
                        className="money mt-0.5 text-sm font-semibold"
                        style={{ color: s.saldo < 0 ? "var(--color-out)" : "var(--color-in)" }}
                      >
                        {money(Math.abs(s.saldo))}
                      </dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>
          <p className="-mt-3 text-xs text-[var(--color-text-faint)]">
            &ldquo;Falta retirar&rdquo; soma o que coube de janeiro até {monthName(mes).toLowerCase()} e
            desconta o que já foi retirado até o fim do mês — a retirada de um mês costuma sair no
            começo do seguinte.
          </p>

          {/* Retiradas do mês (F3.5). */}
          {pronto && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
                  Retiradas em {monthName(mes).toLowerCase()}
                </h2>
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={novaRetirada}>
                  Nova retirada
                </Button>
              </div>
              {retiradasDoMes.length === 0 ? (
                <p className="text-sm text-[var(--color-text-dim)]">
                  Ninguém registrou retirada em {monthName(mes).toLowerCase()}.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {retiradasDoMes.map((r) => {
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
