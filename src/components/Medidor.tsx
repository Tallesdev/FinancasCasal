"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useScope } from "./ScopeProvider";
import { Button } from "./ui";
import {
  aoMudar,
  comecarTroca,
  ligarMedidor,
  limparMedidas,
  medidas,
  medidorLigado,
  type Medida,
} from "@/lib/medidor";

const NOMES: Record<string, string> = {
  "/": "Início",
  "/gastos": "Gastos",
  "/renda": "Renda",
  "/investimentos": "Investimentos",
  "/relatorios": "Relatórios",
  "/relatorios/ciclo": "Ciclo do cartão",
  "/lucro": "Lucro",
  "/acerto": "Acerto",
  "/contas": "Contas",
  "/cartoes": "Cartões",
  "/categorias": "Categorias",
  "/recibos": "Recibos",
  "/importar": "Importar",
  "/ajustes": "Configurações",
};

function useNomeDaTela() {
  const { empresa } = useScope();
  return (caminho: string) =>
    caminho === "/renda" && empresa ? "Recebidos" : NOMES[caminho] ?? caminho;
}

function segundos(ms: number) {
  return `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

function useMedidor() {
  const [, setVersao] = useState(0);
  useEffect(() => aoMudar(() => setVersao((v) => v + 1)), []);
  // Lido a cada render: é localStorage, barato, e só existe no navegador.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return {
    ligado: montado && medidorLigado(),
    lista: montado ? medidas() : [],
  };
}

/**
 * Fica no layout do painel. Marca o começo de cada troca de tela (toque em
 * link ou voltar do celular) e, com o medidor ligado, mostra a última
 * medida num selinho no canto.
 */
export function Medidor() {
  const { ligado, lista } = useMedidor();
  const nome = useNomeDaTela();

  useEffect(() => {
    const toque = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const destino = new URL(link.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname) return;
      comecarTroca(destino.pathname);
    };
    const voltar = () => comecarTroca(window.location.pathname);
    // Captura: roda antes do Link do Next trocar de tela.
    document.addEventListener("click", toque, true);
    window.addEventListener("popstate", voltar);
    return () => {
      document.removeEventListener("click", toque, true);
      window.removeEventListener("popstate", voltar);
    };
  }, []);

  if (!ligado || lista.length === 0) return null;
  const ultima = lista[0];

  return (
    <Link
      href="/ajustes#velocidade"
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-2 z-30 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-2.5 py-1 text-xs tabular-nums text-[var(--color-text-dim)] shadow-lg shadow-black/30 md:bottom-3"
    >
      ⏱ {nome(ultima.tela)}
      {ultima.abertura ? " (abrir)" : ""} · {segundos(ultima.ms)}
    </Link>
  );
}

function mediana(valores: number[]) {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/** A seção "Velocidade" de Configurações: liga/desliga e mostra o resumo. */
export function MedidorAjustes() {
  const { ligado, lista } = useMedidor();
  const nome = useNomeDaTela();

  const resumo = useMemo(() => {
    const grupos = new Map<string, Medida[]>();
    for (const m of lista) {
      const chave = m.abertura ? `abrir:${m.tela}` : m.tela;
      grupos.set(chave, [...(grupos.get(chave) ?? []), m]);
    }
    return [...grupos.values()].map((ms) => ({
      rotulo: ms[0].abertura ? `Abrir o app (${nome(ms[0].tela)})` : nome(ms[0].tela),
      vezes: ms.length,
      mediana: mediana(ms.map((m) => m.ms)),
    }));
  }, [lista, nome]);

  return (
    <section id="velocidade" className="card flex scroll-mt-20 flex-col gap-4 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Velocidade</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Mede quanto cada tela leva pra ficar pronta neste aparelho. Fica só aqui; nada é
          enviado.
        </p>
      </div>

      {ligado && (
        <>
          {resumo.length === 0 ? (
            <p className="text-sm text-[var(--color-text-dim)]">
              Ligado. Agora é só usar o app: abra as telas pelo menu de baixo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-faint)]">
                  <th className="pb-1 font-normal">Tela</th>
                  <th className="pb-1 text-right font-normal">Vezes</th>
                  <th className="pb-1 text-right font-normal">Tempo típico</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {resumo.map((r) => (
                  <tr key={r.rotulo} className="border-t border-[var(--color-line)]">
                    <td className="py-1.5">{r.rotulo}</td>
                    <td className="py-1.5 text-right text-[var(--color-text-dim)]">{r.vezes}</td>
                    <td className="py-1.5 text-right">{segundos(r.mediana)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => ligarMedidor(!ligado)}>
          {ligado ? "Desligar medidor" : "Ligar medidor"}
        </Button>
        {ligado && lista.length > 0 && (
          <Button variant="quiet" onClick={limparMedidas}>
            Zerar medidas
          </Button>
        )}
      </div>
    </section>
  );
}
