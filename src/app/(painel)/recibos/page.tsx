"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { AnexarRecibos } from "@/components/AnexarRecibos";
import {
  Button,
  DeleteButton,
  EmptyState,
  ErrorNote,
  Loading,
  PageTitle,
  Tag,
  inputClass,
} from "@/components/ui";
import { formatDate, money, monthLabel, toISODate } from "@/lib/format";
import {
  apagarRecibo,
  confirmarEnvio,
  tamanhoLegivel,
  urlDoRecibo,
} from "@/lib/recibos";
import type { Receipt } from "@/lib/types";

type ReciboComGasto = Receipt & {
  expenses: { description: string; amount: number; start_date: string } | null;
};

type GastoParaLigar = { id: string; description: string; amount: number; start_date: string };

/** Quantos dias antes e depois da data do recibo procurar gasto pra ligar. */
const JANELA_LIGAR = 45;

/**
 * Recibos por ano (FASE_E.md §3.5). Pensada pra ser aberta uma vez, na
 * época do imposto: escolher o ano, conferir e baixar.
 *
 * Só os recibos de quem está logado — nem na visão "todos" aparece o de
 * outra pessoa (RLS da migração 009).
 */
export default function RecibosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, recursos } = useScope();

  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState("");
  const [recibos, setRecibos] = useState<ReciboComGasto[]>([]);
  const [anos, setAnos] = useState<number[]>([anoAtual]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [novos, setNovos] = useState<Receipt[]>([]);
  const [dataNovo, setDataNovo] = useState(() => toISODate(new Date()));

  const [ligando, setLigando] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<GastoParaLigar[]>([]);

  const carregar = useCallback(async () => {
    if (!recursos.recibos) return setLoading(false);
    setLoading(true);

    const [doAno, todasAsDatas] = await Promise.all([
      supabase
        .from("receipts")
        .select(
          "id, expense_id, mime_type, size_bytes, occurred_on, notes, uploaded_at, created_at, expenses(description, amount, start_date)"
        )
        .eq("user_id", me.id)
        .gte("occurred_on", `${ano}-01-01`)
        .lte("occurred_on", `${ano}-12-31`)
        .order("occurred_on", { ascending: false }),
      supabase.from("receipts").select("occurred_on").eq("user_id", me.id),
    ]);

    if (doAno.error) {
      setError(
        "Não deu para carregar os recibos. Se o app acabou de ser atualizado, a migração 009 pode não ter rodado ainda."
      );
      setLoading(false);
      return;
    }

    setError(null);
    setRecibos((doAno.data ?? []) as unknown as ReciboComGasto[]);
    const encontrados = new Set<number>([anoAtual]);
    for (const r of todasAsDatas.data ?? []) encontrados.add(Number(r.occurred_on.slice(0, 4)));
    setAnos([...encontrados].sort((a, b) => b - a));
    setLoading(false);
  }, [supabase, me.id, ano, anoAtual, recursos.recibos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => recibos.filter((r) => !mes || r.occurred_on.slice(5, 7) === mes),
    [recibos, mes]
  );

  /** Agrupado por mês, do mais recente pro mais antigo. */
  const porMes = useMemo(() => {
    const grupos = new Map<string, ReciboComGasto[]>();
    for (const r of visiveis) {
      const chave = `${r.occurred_on.slice(0, 7)}-01`;
      grupos.set(chave, [...(grupos.get(chave) ?? []), r]);
    }
    return [...grupos.entries()];
  }, [visiveis]);

  const concluidos = visiveis.filter((r) => r.uploaded_at);
  const totalLigado = concluidos.reduce((s, r) => s + Number(r.expenses?.amount ?? 0), 0);
  const semLancamento = concluidos.filter((r) => !r.expense_id).length;

  async function apagar(id: string) {
    setError(null);
    try {
      await apagarRecibo(id);
      setRecibos((lista) => lista.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para apagar.");
    }
  }

  async function conferir(id: string) {
    setError(null);
    try {
      await confirmarEnvio(id);
      carregar();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Não deu para conferir."} Se a foto não chegou, apague e envie de novo.`
      );
    }
  }

  async function abrirLigar(r: ReciboComGasto) {
    setLigando(r.id);
    setCandidatos([]);
    const base = new Date(`${r.occurred_on}T12:00:00`);
    const de = new Date(base);
    de.setDate(de.getDate() - JANELA_LIGAR);
    const ate = new Date(base);
    ate.setDate(ate.getDate() + JANELA_LIGAR);

    const { data } = await supabase
      .from("expenses")
      .select("id, description, amount, start_date")
      .eq("user_id", me.id)
      .gte("start_date", toISODate(de))
      .lte("start_date", toISODate(ate))
      .order("start_date", { ascending: false })
      .limit(100);
    setCandidatos((data ?? []) as GastoParaLigar[]);
  }

  async function ligar(reciboId: string, gasto: GastoParaLigar) {
    setError(null);
    const { error: e } = await supabase
      .from("receipts")
      .update({ expense_id: gasto.id, occurred_on: gasto.start_date.slice(0, 10) })
      .eq("id", reciboId);
    if (e) return setError("Não deu para ligar o recibo ao gasto.");
    setLigando(null);
    carregar();
  }

  if (!recursos.recibos) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle title="Recibos" />
        <EmptyState
          title="Recibos ainda não estão ligados"
          description="Guardar fotos de recibos depende de um armazenamento que ainda não foi configurado neste app."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Recibos"
        description="Suas fotos de recibo por ano — pra ter o comprovante na hora do imposto de renda. Só você vê."
      />

      <section className="card flex flex-col gap-3 px-4 py-5">
        <h2 className="text-sm font-semibold">Guardar um recibo sem lançar o gasto</h2>
        <p className="-mt-2 text-xs text-[var(--color-text-faint)]">
          Pra quando você tem o comprovante e lança depois. Pra anexar a um gasto, use o
          formulário do gasto.
        </p>
        <label className="flex max-w-48 flex-col gap-1.5">
          <span className="text-sm font-medium text-[var(--color-text-dim)]">Data do recibo</span>
          <input
            type="date"
            className={inputClass}
            value={dataNovo}
            onChange={(event) => setDataNovo(event.target.value)}
          />
        </label>
        <AnexarRecibos
          recibos={novos}
          // A foto enviada já aparece na lista abaixo; repetir a miniatura
          // aqui em cima só confundiria.
          onChange={() => {
            setNovos([]);
            carregar();
          }}
          data={dataNovo}
          expenseId={null}
          textoBotao="Escolher foto"
        />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Ano"
          className={`${inputClass} w-auto py-2 sm:text-sm`}
          value={ano}
          onChange={(event) => {
            setAno(Number(event.target.value));
            setMes("");
          }}
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          aria-label="Mês"
          className={`${inputClass} w-auto py-2 sm:text-sm`}
          value={mes}
          onChange={(event) => setMes(event.target.value)}
        >
          <option value="">O ano todo</option>
          {Array.from({ length: 12 }, (_, i) => {
            const m = String(i + 1).padStart(2, "0");
            return (
              <option key={m} value={m}>
                {monthLabel(`${ano}-${m}-01`)}
              </option>
            );
          })}
        </select>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : visiveis.length === 0 ? (
        <EmptyState
          title={mes ? "Nenhum recibo no mês" : `Nenhum recibo em ${ano}`}
          description="Anexe a foto no formulário de um gasto, ou guarde uma aqui em cima."
        />
      ) : (
        <>
          <p className="text-sm text-[var(--color-text-dim)]">
            <strong className="money">{concluidos.length}</strong>{" "}
            {concluidos.length === 1 ? "recibo" : "recibos"}
            {totalLigado > 0 && (
              <>
                {" "}
                · gastos com recibo somam{" "}
                <strong className="money text-[var(--color-text)]">{money(totalLigado)}</strong>
              </>
            )}
            {semLancamento > 0 && <> · {semLancamento} sem lançamento</>}
          </p>

          {porMes.map(([mesChave, lista]) => (
            <section key={mesChave} className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold capitalize text-[var(--color-text-dim)]">
                {monthLabel(mesChave)}
              </h2>
              <ul className="flex flex-col gap-2">
                {lista.map((r) => (
                  <li key={r.id} className="card flex flex-col gap-3 px-4 py-3">
                    <div className="flex items-start gap-3">
                      {r.uploaded_at ? (
                        <a
                          href={urlDoRecibo(r.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)]"
                          aria-label="Ver recibo"
                        >
                          <img
                            src={urlDoRecibo(r.id)}
                            alt="Recibo"
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ) : (
                        <span className="flex h-20 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--color-line)] text-center text-[10px] text-[var(--color-text-faint)]">
                          sem foto
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {r.expenses?.description ?? "Recibo"}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                          <span>{formatDate(r.occurred_on)}</span>
                          {!r.uploaded_at ? (
                            <Tag>envio não concluído</Tag>
                          ) : !r.expense_id ? (
                            <Tag>sem lançamento</Tag>
                          ) : null}
                          {r.size_bytes ? <span>{tamanhoLegivel(r.size_bytes)}</span> : null}
                        </p>
                      </div>

                      {r.expenses && (
                        <span className="money shrink-0 font-semibold">
                          {money(r.expenses.amount)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      {r.uploaded_at ? (
                        <a
                          href={urlDoRecibo(r.id, true)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
                        >
                          Baixar
                        </a>
                      ) : (
                        <Button
                          variant="quiet"
                          className="px-2 py-1 text-xs"
                          onClick={() => conferir(r.id)}
                        >
                          Conferir envio
                        </Button>
                      )}
                      {r.uploaded_at && !r.expense_id && (
                        <Button
                          variant="quiet"
                          className="px-2 py-1 text-xs"
                          onClick={() => (ligando === r.id ? setLigando(null) : abrirLigar(r))}
                        >
                          {ligando === r.id ? "Fechar" : "Ligar a um gasto"}
                        </Button>
                      )}
                      <DeleteButton onConfirm={() => apagar(r.id)} label="Apagar" />
                    </div>

                    {ligando === r.id && (
                      <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-3">
                        {candidatos.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-faint)]">
                            Nenhum gasto seu até {JANELA_LIGAR} dias antes ou depois desta data.{" "}
                            <Link href="/gastos" className="underline">
                              Lançar em Gastos
                            </Link>
                            .
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-[var(--color-text-faint)]">
                              Seus gastos perto de {formatDate(r.occurred_on)}:
                            </p>
                            <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                              {candidatos.map((g) => (
                                <li key={g.id}>
                                  <button
                                    type="button"
                                    onClick={() => ligar(r.id, g)}
                                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate">{g.description}</span>
                                      <span className="text-xs text-[var(--color-text-faint)]">
                                        {formatDate(g.start_date)}
                                      </span>
                                    </span>
                                    <span className="money shrink-0">{money(g.amount)}</span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
