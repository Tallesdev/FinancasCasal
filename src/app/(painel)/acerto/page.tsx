"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import {
  Button,
  DeleteButton,
  Dot,
  EmptyState,
  ErrorNote,
  Loading,
  PageTitle,
} from "@/components/ui";
import { firstDayOfMonth, formatDate, money, monthLabel, toISODate } from "@/lib/format";
import { EMPRESA, paraZerar, saldos, type Movimento, type Ponta } from "@/lib/acerto";
import type {
  Expense,
  ExpenseOccurrence,
  Income,
  IncomeReceived,
  Settlement,
} from "@/lib/types";

const firstName = (full: string) => full.split(" ")[0];

/** Um gasto pago do bolso, já no mês em que caiu (fixo/parcelado contam mês a mês). */
type GastoDoBolso = { chave: string; quem: string; descricao: string; mes: string; valor: number };
/** Um recebimento que caiu na conta de um sócio. */
type RecebidoNaConta = { chave: string; quem: string; descricao: string; dia: string; valor: number };

/**
 * Acerto entre sócios (FASE_F.md, F4.3). Só empresa.
 * Mostra o que cada sócio pagou do bolso e recebeu na conta dele, e as
 * transferências que zeram tudo. "Feito" registra o acerto.
 */
export default function AcertoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { members, empresa } = useScope();

  const [gastos, setGastos] = useState<GastoDoBolso[]>([]);
  const [recebidos, setRecebidos] = useState<RecebidoNaConta[]>([]);
  const [acertos, setAcertos] = useState<Settlement[]>([]);
  const [pronto, setPronto] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState<string | null>(null);

  const ids = useMemo(() => members.map((m) => m.id), [members]);
  const porId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const load = useCallback(async () => {
    if (!empresa) return;
    setLoading(true);
    const mesAtual = firstDayOfMonth(toISODate(new Date()));

    const [gastosResult, incomesResult, recebidosResult, acertosResult] = await Promise.all([
      supabase.from("expenses").select("*").not("paid_by", "is", null),
      supabase.from("incomes").select("*").not("received_into", "is", null),
      supabase.from("income_received").select("*"),
      supabase.from("settlements").select("*").order("paid_on", { ascending: false }),
    ]);

    if (gastosResult.error || incomesResult.error || acertosResult.error) {
      // Coluna ou tabela ausente = migração 016 ainda não rodou.
      setPronto(false);
      setLoading(false);
      return;
    }
    setPronto(true);

    // Gastos do bolso: cada mês que já aconteceu (fixo e parcelado contam
    // mês a mês, só até o mês atual — o futuro ainda não saiu do bolso).
    const doBolso = (gastosResult.data ?? []) as Expense[];
    let ocorrencias: ExpenseOccurrence[] = [];
    if (doBolso.length) {
      const inicio = doBolso.map((e) => e.start_date).sort()[0];
      const { data, error: e } = await supabase.rpc("expense_occurrences", {
        p_from: firstDayOfMonth(inicio),
        p_to: mesAtual,
      });
      if (e) {
        setError("Não deu para somar os gastos pagos do bolso.");
        setLoading(false);
        return;
      }
      ocorrencias = (data ?? []) as ExpenseOccurrence[];
    }
    const gastoPorId = new Map(doBolso.map((e) => [e.id, e]));
    setGastos(
      ocorrencias
        .filter((o) => gastoPorId.has(o.expense_id))
        .map((o) => ({
          chave: `${o.expense_id}|${o.month}`,
          quem: gastoPorId.get(o.expense_id)!.paid_by!,
          descricao:
            o.installment_number && o.installments_total
              ? `${o.description} (${o.installment_number}/${o.installments_total})`
              : o.description,
          mes: o.month,
          valor: Number(o.amount),
        }))
        .sort((a, b) => b.mes.localeCompare(a.mes))
    );

    // Recebimentos na conta de um sócio: só o que já caiu de verdade.
    const naConta = new Map(((incomesResult.data ?? []) as Income[]).map((i) => [i.id, i]));
    const marcados = recebidosResult.error ? [] : ((recebidosResult.data ?? []) as IncomeReceived[]);
    setRecebidos(
      marcados
        .filter((r) => naConta.has(r.income_id))
        .map((r) => {
          const income = naConta.get(r.income_id)!;
          return {
            chave: `${r.income_id}|${r.month}`,
            quem: income.received_into!,
            descricao: income.client ? `${income.client} · ${income.source}` : income.source,
            dia: r.received_on,
            valor: Number(income.amount),
          };
        })
        .sort((a, b) => b.dia.localeCompare(a.dia))
    );

    setAcertos((acertosResult.data ?? []) as Settlement[]);
    setError(null);
    setLoading(false);
  }, [supabase, empresa]);

  useEffect(() => {
    load();
  }, [load]);

  const conta = useMemo(() => {
    const pagou: Record<string, number> = {};
    const recebeu: Record<string, number> = {};
    for (const g of gastos) pagou[g.quem] = (pagou[g.quem] ?? 0) + g.valor;
    for (const r of recebidos) recebeu[r.quem] = (recebeu[r.quem] ?? 0) + r.valor;
    const resultado = saldos(ids, pagou, recebeu, acertos);
    const movimentos = paraZerar([
      ...resultado.socios.map((s) => ({ ponta: s.user_id as Ponta, saldo: s.saldo })),
      { ponta: EMPRESA, saldo: resultado.empresa },
    ]);
    return { ...resultado, movimentos };
  }, [gastos, recebidos, acertos, ids]);

  const nome = (ponta: Ponta | null) =>
    ponta === null || ponta === EMPRESA
      ? "Conta da empresa"
      : porId.get(ponta)
        ? firstName(porId.get(ponta)!.display_name)
        : "Ex-sócio";
  const cor = (ponta: Ponta | null) =>
    ponta && ponta !== EMPRESA ? (porId.get(ponta)?.color ?? null) : null;

  async function feito(m: Movimento) {
    const k = `${m.de}>${m.para}`;
    setRegistrando(k);
    const { error: e } = await supabase.from("settlements").insert({
      from_user: m.de === EMPRESA ? null : m.de,
      to_user: m.para === EMPRESA ? null : m.para,
      amount: m.valor,
      paid_on: toISODate(new Date()),
    });
    setRegistrando(null);
    if (e) return setError("Não deu para registrar o acerto. Tente de novo.");
    load();
  }

  async function apagar(id: string) {
    await supabase.from("settlements").delete().eq("id", id);
    load();
  }

  if (!empresa) {
    return (
      <EmptyState
        title="Só para empresa"
        description="O acerto entre sócios aparece nas contas do tipo Empresa."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        voltar={{ href: "/lucro", rotulo: "Lucro" }}
        title="Acerto entre sócios"
        description="Quem pagou gasto do bolso e quem recebeu cliente na conta pessoal — e como zerar."
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {!pronto ? (
        <ErrorNote>
          O acerto ainda não está ligado no banco (migração 016). Assim que ela rodar, esta tela
          começa a somar.
        </ErrorNote>
      ) : loading ? (
        <Loading />
      ) : (
        <>
          {/* Pra zerar: o que importa primeiro. */}
          <section className="card flex flex-col gap-3 px-4 py-4">
            <h2 className="text-sm font-semibold">Pra zerar</h2>
            {conta.movimentos.length === 0 ? (
              <p className="text-sm text-[var(--color-in)]">Tudo acertado. Ninguém deve nada a ninguém.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {conta.movimentos.map((m) => {
                  const k = `${m.de}>${m.para}`;
                  return (
                    <li key={k} className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm">
                        <Dot color={cor(m.de)} />
                        <strong>{nome(m.de)}</strong>
                        <span className="text-[var(--color-text-faint)]">passa</span>
                        <span className="money font-semibold">{money(m.valor)}</span>
                        <span className="text-[var(--color-text-faint)]">para</span>
                        <Dot color={cor(m.para)} />
                        <strong>{nome(m.para)}</strong>
                      </p>
                      <Button
                        variant="ghost"
                        className="px-3 py-1 text-xs"
                        disabled={registrando === k}
                        onClick={() => feito(m)}
                      >
                        Feito
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Saldo de cada sócio. */}
          <div className="grid gap-3 sm:grid-cols-2">
            {conta.socios.map((s) => (
              <div key={s.user_id} className="card flex flex-col gap-2 px-4 py-4">
                <p className="flex items-center gap-2 font-semibold">
                  <Dot color={cor(s.user_id)} />
                  {nome(s.user_id)}
                </p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--color-text-faint)]">
                  <dt>Pagou do bolso</dt>
                  <dd className="money text-right text-[var(--color-text)]">{money(s.pagouDoBolso)}</dd>
                  <dt>Recebeu na conta dele</dt>
                  <dd className="money text-right text-[var(--color-text)]">{money(s.recebeuNaConta)}</dd>
                  <dt>Acertos pagos / recebidos</dt>
                  <dd className="money text-right text-[var(--color-text)]">
                    {money(s.acertosPagos)} / {money(s.acertosRecebidos)}
                  </dd>
                </dl>
                <p
                  className="text-sm font-semibold"
                  style={{
                    color:
                      s.saldo > 0 ? "var(--color-in)" : s.saldo < 0 ? "var(--color-out)" : "var(--color-text-dim)",
                  }}
                >
                  {s.saldo > 0
                    ? `Tem a receber ${money(s.saldo)}`
                    : s.saldo < 0
                      ? `Deve ${money(-s.saldo)}`
                      : "Zerado"}
                </p>
              </div>
            ))}
          </div>

          {/* De onde vem cada número. */}
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Gastos pagos do bolso
            </h2>
            {gastos.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">
                Nenhum. Em Gastos, &ldquo;Quem pagou&rdquo; marca quando saiu do bolso de alguém.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {gastos.map((g) => (
                  <li key={g.chave} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{g.descricao}</span>
                      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                        <Dot color={cor(g.quem)} /> {nome(g.quem)} · {monthLabel(g.mes, true)}
                      </span>
                    </span>
                    <span className="money shrink-0 font-semibold">{money(g.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Recebimentos que caíram na conta de um sócio
            </h2>
            {recebidos.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">
                Nenhum. Em Recebimentos, &ldquo;Onde o dinheiro cai&rdquo; marca quando foi pra conta de alguém.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {recebidos.map((r) => (
                  <li key={r.chave} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{r.descricao}</span>
                      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                        <Dot color={cor(r.quem)} /> {nome(r.quem)} · {formatDate(r.dia)}
                      </span>
                    </span>
                    <span className="money shrink-0 font-semibold text-[var(--color-in)]">{money(r.valor)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Acertos feitos
            </h2>
            {acertos.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">Nenhum ainda.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {acertos.map((a) => (
                  <li key={a.id} className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {nome(a.from_user)} → {nome(a.to_user)}
                      </span>
                      <span className="text-xs text-[var(--color-text-faint)]">{formatDate(a.paid_on)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="money font-semibold">{money(a.amount)}</span>
                      <DeleteButton onConfirm={() => apagar(a.id)} label="Desfazer" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
