"use client";

import dynamic from "next/dynamic";

/**
 * O gráfico de barras sob demanda. recharts é, de longe, a maior dependência
 * do app; carregada junto, a página inicial só aparecia depois de baixar e
 * executar a biblioteca inteira — num celular médio, a diferença se sente.
 * Assim os números aparecem primeiro e o gráfico chega logo depois, num
 * espaço já reservado (sem a página pular).
 */
export const MonthlyBars = dynamic(
  () => import("./charts").then((m) => m.MonthlyBars),
  {
    ssr: false,
    loading: () => <div style={{ height: 260 }} aria-hidden="true" />,
  }
);
