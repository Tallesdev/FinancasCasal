"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, ErrorNote, Field, Loading, Sheet, inputClass } from "./ui";
import { dividirValor, faltamDepois, parcelasDoGasto } from "@/lib/parcelas";
import { formatDate, money, monthLabel, toISODate } from "@/lib/format";
import { lerValor } from "@/lib/planilha";
import type { Expense, InstallmentAdvance } from "@/lib/types";

/**
 * Adiantar parcelas de uma compra parcelada (C38). A pessoa marca quais
 * parcelas pagou antes da hora; elas saem do mês delas e entram no dia do
 * adiantamento (migração 025). O gasto em si não muda, e dá pra desfazer.
 */
export function AdiantarParcelas({
  gasto,
  onClose,
  onMudou,
}: {
  gasto: Expense;
  onClose: () => void;
  /** Depois de adiantar ou desfazer: a tela recarrega os gastos. */
  onMudou: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const hoje = toISODate(new Date());
  const [adiantamentos, setAdiantamentos] = useState<InstallmentAdvance[] | null>(null);
  const [escolhidas, setEscolhidas] = useState<Set<number>>(new Set());
  const [data, setData] = useState(hoje);
  const [valorPago, setValorPago] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const { data: linhas, error } = await supabase
      .from("installment_advances")
      .select("*")
      .eq("expense_id", gasto.id)
      .order("installment_number");
    if (error) {
      setErro("Não deu para carregar as parcelas. A migração 025 pode não ter rodado ainda.");
      setAdiantamentos([]);
      return;
    }
    setAdiantamentos((linhas ?? []) as InstallmentAdvance[]);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasto.id]);

  const parcelas = useMemo(
    () => (adiantamentos ? parcelasDoGasto(gasto, adiantamentos, hoje) : []),
    [gasto, adiantamentos, hoje]
  );
  const aVencer = parcelas.filter((p) => p.situacao === "a vencer");
  const adiantadas = parcelas.filter((p) => p.situacao === "adiantada");
  const pagas = parcelas.filter((p) => p.situacao === "paga").length;

  const somaEscolhidas =
    Math.round(aVencer.filter((p) => escolhidas.has(p.n)).reduce((s, p) => s + p.valor, 0) * 100) / 100;
  const pago = valorPago.trim() ? (lerValor(valorPago) ?? NaN) : somaEscolhidas;
  const depois = faltamDepois(parcelas, escolhidas);

  function alternar(n: number) {
    setEscolhidas((atual) => {
      const nova = new Set(atual);
      if (nova.has(n)) nova.delete(n);
      else nova.add(n);
      return nova;
    });
  }

  /** As últimas N: é o que o banco costuma antecipar. */
  function ultimas(qtd: number) {
    setEscolhidas(new Set(aVencer.slice(-qtd).map((p) => p.n)));
  }

  async function adiantar() {
    setErro(null);
    const numeros = aVencer.filter((p) => escolhidas.has(p.n)).map((p) => p.n);
    if (!numeros.length) return setErro("Marque pelo menos uma parcela.");
    if (!data) return setErro("Diga quando você pagou.");
    if (!Number.isFinite(pago) || pago <= 0) return setErro("Valor pago inválido.");
    if (pago > somaEscolhidas + 0.005)
      return setErro(`O valor pago passa da soma das parcelas (${money(somaEscolhidas)}).`);

    const valores = dividirValor(pago, numeros.length);
    setSalvando(true);
    const { error } = await supabase.from("installment_advances").insert(
      numeros.map((n, i) => ({
        expense_id: gasto.id,
        installment_number: n,
        paid_on: data,
        amount: valores[i],
      }))
    );
    setSalvando(false);
    if (error) return setErro("Não deu para adiantar. Tente de novo.");
    setEscolhidas(new Set());
    setValorPago("");
    await carregar();
    onMudou();
  }

  async function desfazer(id: string) {
    setErro(null);
    setSalvando(true);
    const { error } = await supabase.from("installment_advances").delete().eq("id", id);
    setSalvando(false);
    if (error) return setErro("Não deu para desfazer. Tente de novo.");
    await carregar();
    onMudou();
  }

  const total = gasto.installments_total ?? 1;

  return (
    <Sheet title="Adiantar parcelas" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-dim)]">
          <strong className="text-[var(--color-text)]">{gasto.description}</strong> · {total}x de{" "}
          {money(Number(gasto.amount))}. {pagas} já {pagas === 1 ? "passou" : "passaram"}
          {adiantadas.length ? `, ${adiantadas.length} adiantada${adiantadas.length === 1 ? "" : "s"}` : ""} e{" "}
          {aVencer.length} a vencer.
        </p>

        {erro && <ErrorNote>{erro}</ErrorNote>}

        {!adiantamentos ? (
          <Loading />
        ) : (
          <>
            {aVencer.length === 0 ? (
              <p className="text-sm text-[var(--color-text-dim)]">Não sobrou parcela a vencer pra adiantar.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3].filter((q) => q < aVencer.length).map((q) => (
                    <Button key={q} variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => ultimas(q)}>
                      {q === 1 ? "A última" : `As ${q} últimas`}
                    </Button>
                  ))}
                  <Button variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => ultimas(aVencer.length)}>
                    Todas ({aVencer.length})
                  </Button>
                  {escolhidas.size > 0 && (
                    <Button variant="quiet" className="px-2.5 py-1 text-xs" onClick={() => setEscolhidas(new Set())}>
                      Limpar
                    </Button>
                  )}
                </div>

                <ul className="flex flex-col divide-y divide-[var(--color-line)] rounded-lg border border-[var(--color-line)]">
                  {aVencer.map((p) => (
                    <li key={p.n}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--scope)]"
                          checked={escolhidas.has(p.n)}
                          onChange={() => alternar(p.n)}
                        />
                        <span className="flex-1">
                          Parcela {p.n} de {total}
                          <span className="text-[var(--color-text-faint)]"> · {formatDate(p.dataNormal)}</span>
                        </span>
                        <span className="money">{money(p.valor)}</span>
                      </label>
                    </li>
                  ))}
                </ul>

                {escolhidas.size > 0 && (
                  <>
                    <Field label="Quando você pagou" hint="As parcelas entram no gasto deste dia.">
                      <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
                    </Field>
                    <Field
                      label="Quanto pagou"
                      hint={`Opcional. Deixe vazio se pagou cheio (${money(somaEscolhidas)}); preencha se o banco deu desconto.`}
                    >
                      <input
                        className={`${inputClass} money`}
                        inputMode="decimal"
                        placeholder={money(somaEscolhidas)}
                        value={valorPago}
                        onChange={(e) => setValorPago(e.target.value)}
                      />
                    </Field>

                    <p className="rounded-lg border border-[var(--scope)]/30 bg-[var(--scope)]/10 px-3.5 py-2.5 text-sm">
                      {escolhidas.size} {escolhidas.size === 1 ? "parcela" : "parcelas"} ·{" "}
                      {Number.isFinite(pago) ? money(pago) : "—"} entram em {data ? monthLabel(data) : "—"}.
                      <span className="mt-1 block text-xs text-[var(--color-text-dim)]">
                        {depois.quantas === 0
                          ? "Com isso, a compra fica quitada."
                          : `Depois disso, faltam ${depois.quantas} ${depois.quantas === 1 ? "parcela" : "parcelas"} (${money(depois.valor)}), a última em ${monthLabel(depois.ultima!)}.`}
                      </span>
                    </p>

                    <Button onClick={adiantar} disabled={salvando}>
                      {salvando
                        ? "Adiantando…"
                        : `Adiantar ${escolhidas.size} ${escolhidas.size === 1 ? "parcela" : "parcelas"}`}
                    </Button>
                  </>
                )}
              </>
            )}

            {adiantadas.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-semibold">Já adiantadas</p>
                <ul className="flex flex-col gap-1 text-sm">
                  {adiantadas.map((p) => (
                    <li key={p.n} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-[var(--color-text-dim)]">
                        Parcela {p.n} · paga em {formatDate(p.data)}
                        <span className="text-[var(--color-text-faint)]"> (era {formatDate(p.dataNormal)})</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="money">{money(p.valor)}</span>
                        <Button
                          variant="quiet"
                          className="px-2 py-0.5 text-xs"
                          disabled={salvando}
                          onClick={() => desfazer(p.adiantamento!.id)}
                        >
                          Desfazer
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
