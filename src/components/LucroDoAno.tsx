"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useScope } from "./ScopeProvider";
import { useLucro } from "./useLucro";
import { Dot, ErrorNote, Loading } from "./ui";
import { money, monthName } from "@/lib/format";

const firstName = (full: string) => full.split(" ")[0];

/**
 * Lucro e divisão do ano, em Relatórios (C39): pra ter noção do ano. A
 * divisão do dia a dia (o mês, as retiradas) fica na tela Lucro.
 */
export function LucroDoAno({ ano }: { ano: number }) {
  const { members } = useScope();
  const porId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const { loading, error, partes, reservaPct, meses, resumo } = useLucro(ano);
  const comMovimento = meses.filter((m) => m.faturou || m.gastou);

  return (
    <section className="card flex flex-col gap-4 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Lucro e divisão em {ano}</h2>
        <p className="mt-1 text-xs text-[var(--color-text-faint)]">
          Quanto a empresa lucrou no ano e quanto coube a cada sócio. Pra dividir e registrar
          retirada, use a tela{" "}
          <Link href="/lucro" className="underline">
            Lucro
          </Link>
          , mês a mês.
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs text-[var(--color-text-faint)]">
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

          <ul className="flex flex-col divide-y divide-[var(--color-line)]">
            {resumo.socios.map((s) => {
              const pessoa = porId.get(s.user_id);
              return (
                <li key={s.user_id} className="flex flex-col gap-1.5 py-2.5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
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
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)]">
              Mês a mês
            </h3>
            {comMovimento.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">Nenhum lançamento em {ano}.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--color-line)] text-sm">
                {[...comMovimento].reverse().map((m) => (
                  <li key={m.mes} className="flex flex-col gap-0.5 py-2">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{monthName(m.mes)}</span>
                      <span
                        className="money font-semibold"
                        style={{ color: m.lucro < 0 ? "var(--color-out)" : "var(--color-in)" }}
                      >
                        {m.lucro < 0 ? `− ${money(-m.lucro)}` : money(m.lucro)}
                      </span>
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-xs text-[var(--color-text-faint)]">
                      <span>
                        Faturou <span className="money">{money(m.faturou)}</span> · gastou{" "}
                        <span className="money">{money(m.gastou)}</span>
                      </span>
                      {m.lucro > 0 &&
                        partes.map((p) => (
                          <span key={p.user_id} className="inline-flex items-center gap-1">
                            <Dot color={porId.get(p.user_id)?.color ?? null} />
                            {firstName(porId.get(p.user_id)?.display_name ?? "Sócio")}{" "}
                            <span className="money">{money(m.partes[p.user_id] ?? 0)}</span>
                          </span>
                        ))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
