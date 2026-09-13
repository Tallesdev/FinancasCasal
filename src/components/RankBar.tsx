/* Fora de charts.tsx de propósito: não usa recharts, e importar dali
   arrastava a biblioteca inteira pra telas que só mostram esta barra. */

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
