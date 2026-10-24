"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChaveGuardada, useScope } from "./ScopeProvider";
import { guardar, lerGuardado } from "@/lib/guardado";
import { buscarLucroPorCliente, type GastoComCliente, type LucroPorClienteGuardado } from "@/lib/telas";
import { Button, ErrorNote, Loading } from "./ui";
import { listarClientes, ultimosClientes } from "@/lib/orcamentos-app";
import { formatDate, money, monthLabel } from "@/lib/format";
import { chaveDoCliente, lucroPorCliente, type NomeSolto } from "@/lib/clientes";
import { mesesDe } from "@/lib/recebimentos";
import type { Income } from "@/lib/types";

/**
 * Lucro por cliente no ano (FASE_F.md, F5.1). Só empresa, e sempre a
 * empresa inteira (como a tela Lucro): o seletor de sócio não muda.
 * Toque num cliente pra ver de onde vem cada número.
 */
export function LucroPorCliente({ ano }: { ano: number }) {
  const supabase = useMemo(() => createClient(), []);
  const { members, me, recursos } = useScope();
  // Clientes do cadastro (app de orçamentos): também contam como cliente.
  const [cadastrados, setCadastrados] = useState<string[]>(() => (ultimosClientes() ?? []).map((c) => c.name));
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const ids = useMemo(() => members.map((m) => m.id), [members]);

  // O que este quadro tinha da última vez (lib/guardado.ts).
  const chave = useChaveGuardada("lucro-por-cliente", ano);
  const [inicial] = useState(() => lerGuardado<LucroPorClienteGuardado>(chave));
  const [incomes, setIncomes] = useState<Income[]>(inicial?.incomes ?? []);
  const [gastos, setGastos] = useState<GastoComCliente[]>(inicial?.gastos ?? []);
  const [loading, setLoading] = useState(!inicial);
  const [error, setError] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const load = useCallback(async () => {
    const guardado = lerGuardado<LucroPorClienteGuardado>(chave);
    if (guardado) {
      setIncomes(guardado.incomes);
      setGastos(guardado.gastos);
      setLoading(false);
    } else setLoading(true);

    const novos = await buscarLucroPorCliente(supabase, ano, ids);
    if (!novos) {
      setError("Não deu para carregar o lucro por cliente.");
      setLoading(false);
      return;
    }
    guardar(chave, novos);
    setIncomes(novos.incomes);
    setGastos(novos.gastos);
    setError(null);
    setLoading(false);
  }, [supabase, chave, ano, ids]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!recursos.orcamentos) return;
    listarClientes()
      .then((l) => setCadastrados(l.map((c) => c.name)))
      .catch(() => {});
  }, [recursos.orcamentos]);

  const resultado = useMemo(
    () => lucroPorCliente(ano, incomes, gastos, cadastrados),
    [ano, incomes, gastos, cadastrados]
  );

  /**
   * Corrige na origem o nome solto (C33): troca pelo cliente certo ou tira o
   * cliente. Só os gastos de quem está logado — a RLS não deixa mexer nos do
   * sócio, então eles ficam pra ele corrigir.
   */
  async function corrigir(solto: NomeSolto, novo: string | null) {
    const doNome = gastos.filter((g) => g.client && chaveDoCliente(g.client) === solto.chave);
    const meus = [...new Set(doNome.filter((g) => g.user_id === me.id).map((g) => g.expense_id))];
    const doSocio = new Set(doNome.filter((g) => g.user_id && g.user_id !== me.id).map((g) => g.expense_id)).size;
    setAviso(null);
    if (!meus.length) {
      return setAviso(`Os gastos com "${solto.nome}" foram lançados pelo sócio: ele precisa corrigir no celular dele.`);
    }
    setCorrigindo(solto.chave);
    const { error: e } = await supabase.from("expenses").update({ client: novo }).in("id", meus);
    setCorrigindo(null);
    if (e) return setAviso("Não deu para corrigir. Tente de novo.");
    if (doSocio) setAviso(`Corrigi os seus. ${doSocio} ${doSocio === 1 ? "gasto foi lançado" : "gastos foram lançados"} pelo sócio e ele precisa corrigir.`);
    load();
  }

  /** De onde vem cada número do cliente aberto. */
  const detalhe = useMemo(() => {
    if (!aberto) return null;
    const entradas = incomes
      .filter((i) => i.client && chaveDoCliente(i.client) === aberto)
      .map((i) => {
        const meses = mesesDe(i, `${ano}-12-01`).filter((m) => m >= `${ano}-01-01`);
        return { id: i.id, texto: i.source, quando: i.start_date, qtd: meses.length, valor: meses.length * Number(i.amount) };
      })
      .filter((e) => e.qtd > 0);
    const saidas = gastos.filter((g) => g.client && chaveDoCliente(g.client) === aberto);
    return { entradas, saidas };
  }, [aberto, incomes, gastos, ano]);

  return (
    <section className="card px-4 py-5">
      <h2 className="mb-1 text-sm font-semibold">Lucro por cliente</h2>
      <p className="mb-3 text-xs text-[var(--color-text-faint)]">
        Faturado do cliente em {ano} menos os gastos marcados com o nome dele. Toque pra ver o detalhe.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {loading ? (
        <Loading />
      ) : resultado.clientes.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--color-text-dim)]">
          Nenhum recebimento ou gasto com cliente em {ano}. Preencha &ldquo;Cliente&rdquo; ao lançar
          pra ver aqui.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-line)]">
          {resultado.clientes.map((c) => {
            const estaAberto = aberto === c.chave;
            return (
              <li key={c.chave} className="py-2.5">
                <button
                  type="button"
                  aria-expanded={estaAberto}
                  onClick={() => setAberto(estaAberto ? null : c.chave)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.nome}</span>
                    <span className="block text-xs text-[var(--color-text-faint)]">
                      Faturou <span className="money">{money(c.faturou)}</span> · gastou{" "}
                      <span className="money">{money(c.gastou)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className="money block font-semibold"
                      style={{ color: c.lucro < 0 ? "var(--color-out)" : "var(--color-in)" }}
                    >
                      {c.lucro < 0 ? `− ${money(-c.lucro)}` : money(c.lucro)}
                    </span>
                    {c.margem !== null && (
                      <span className="block text-[11px] text-[var(--color-text-faint)]">
                        {c.margem.toLocaleString("pt-BR")}% de margem
                      </span>
                    )}
                  </span>
                </button>

                {estaAberto && detalhe && (
                  <div className="mt-2 flex flex-col gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2.5 text-xs">
                    {detalhe.entradas.map((e) => (
                      <p key={e.id} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate text-[var(--color-text-dim)]">
                          {e.texto} · {formatDate(e.quando)}
                          {e.qtd > 1 ? ` · ${e.qtd} meses em ${ano}` : ""}
                        </span>
                        <span className="money shrink-0 text-[var(--color-in)]">{money(e.valor)}</span>
                      </p>
                    ))}
                    {detalhe.saidas.map((g) => (
                      <p key={`${g.expense_id}|${g.month}`} className="flex justify-between gap-3">
                        <span className="min-w-0 truncate text-[var(--color-text-dim)]">
                          {g.description} · {monthLabel(g.month, true)}
                        </span>
                        <span className="money shrink-0 text-[var(--color-out)]">− {money(g.amount)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && resultado.soltos.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 rounded-lg border border-[var(--color-line)] px-3.5 py-3">
          <p className="text-sm font-semibold">Nomes nos gastos que não são clientes</p>
          <p className="-mt-1 text-xs text-[var(--color-text-faint)]">
            Estão no campo Cliente de algum gasto, mas não têm recebimento nem cadastro. Não entram na lista
            acima; contam como gasto sem cliente.
          </p>
          <ul className="flex flex-col gap-2">
            {resultado.soltos.map((s) => (
              <li key={s.chave} className="flex flex-col gap-1.5 text-sm">
                <p className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {s.nome}
                    {s.pareceCom && (
                      <span className="text-[var(--color-text-faint)]"> · parece {s.pareceCom}</span>
                    )}
                  </span>
                  <span className="money shrink-0 text-[var(--color-out)]">{money(s.gastou)}</span>
                </p>
                <span className="flex flex-wrap gap-1.5">
                  {s.pareceCom && (
                    <Button
                      variant="ghost"
                      className="px-2.5 py-1 text-xs"
                      disabled={corrigindo !== null}
                      onClick={() => corrigir(s, s.pareceCom)}
                    >
                      É {s.pareceCom}
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    className="px-2.5 py-1 text-xs"
                    disabled={corrigindo !== null}
                    onClick={() => corrigir(s, null)}
                  >
                    Não é cliente (tirar)
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {aviso && <p className="text-xs text-[var(--color-text-dim)]">{aviso}</p>}
        </div>
      )}

      {!loading && (resultado.semCliente.faturou > 0 || resultado.semCliente.gastou > 0) && (
        <p className="mt-3 text-xs text-[var(--color-text-faint)]">
          Sem cliente: faturou <span className="money">{money(resultado.semCliente.faturou)}</span> e
          gastou <span className="money">{money(resultado.semCliente.gastou)}</span> (gasto geral da
          empresa, como combustível do mês, normalmente fica sem cliente mesmo).
        </p>
      )}
    </section>
  );
}
