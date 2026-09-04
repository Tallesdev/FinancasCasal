"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money, moneyShort, monthLabel, monthName } from "@/lib/format";

/* =====================================================================
   Gráficos do app. As cores são semânticas e fixas: entrada, saída e
   investimento sempre têm o mesmo significado em toda tela.
   ===================================================================== */

export type ChartSeries = {
  key: "income" | "expense" | "investment";
  label: string;
  color: string;
};

export const SERIES: Record<ChartSeries["key"], ChartSeries> = {
  income: { key: "income", label: "Entrou", color: "var(--color-in)" },
  expense: { key: "expense", label: "Saiu", color: "var(--color-out)" },
  investment: {
    key: "investment",
    label: "Investiu",
    color: "var(--color-invest)",
  },
};

type Row = {
  month: string;
  income: number;
  expense: number;
  investment: number;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold">{monthLabel(String(label))}</p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((item) => (
          <li
            key={item.dataKey}
            className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]"
          >
            <span
              aria-hidden="true"
              style={{ background: item.color }}
              className="h-2 w-2 rounded-full"
            />
            {SERIES[item.dataKey as ChartSeries["key"]]?.label}
            <span className="money ml-auto text-[var(--color-text)]">
              {money(item.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras mensais. Uma escala só para todas as séries — nunca dois eixos. */
export function MonthlyBars({
  data,
  series,
  height = 260,
}: {
  data: Row[];
  series: ChartSeries["key"][];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
          barCategoryGap="28%"
          barGap={2}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--color-line)"
            strokeDasharray="2 4"
          />
          <XAxis
            dataKey="month"
            tickFormatter={(value: string) => monthName(value, true)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--color-text-faint)", fontSize: 12 }}
          />
          <YAxis
            width={54}
            tickFormatter={(value: number) => moneyShort(value)}
            tickLine={false}
            axisLine={false}
            // O eixo mostra valor: precisa sumir junto quando ocultar.
            tick={{
              fill: "var(--color-text-faint)",
              fontSize: 11,
              className: "money",
            }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: "var(--color-surface-2)", opacity: 0.5 }}
          />
          {series.length > 1 && (
            <Legend
              verticalAlign="top"
              align="left"
              height={28}
              formatter={(value: string) => (
                <span className="text-xs text-[var(--color-text-dim)]">
                  {SERIES[value as ChartSeries["key"]]?.label}
                </span>
              )}
            />
          )}
          {series.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={SERIES[key].color}
              radius={[4, 4, 0, 0]}
              maxBarSize={22}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barra horizontal simples para o ranking de categorias. */
export function RankBar({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  color: string;
}) {
  const width = total > 0 ? Math.max((value / total) * 100, 2) : 0;
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]"
      aria-hidden="true"
    >
      <div
        style={{ width: `${width}%`, background: color }}
        className="h-full rounded-full"
      />
    </div>
  );
}
