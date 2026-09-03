"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { formatDate, money, toISODate } from "@/lib/format";
import type { CycleBounds, CycleSummaryRow } from "@/lib/types";

/**
 * Para quem tem o mês definido pelo cartão, a pergunta que aperta não é
 * "quanto gastei em setembro" — é "quanto fecha, e quando sai". Isso
 * precisa estar na primeira tela, não escondido num relatório.
 *
 * Só aparece para quem escolheu um cartão âncora em /relatorios/ciclo.
 */
export function FaturaAviso() {
  const supabase = useMemo(() => createClient(), []);
  const { me } = useScope();

  const [bounds, setBounds] = useState<CycleBounds | null>(null);
  const [total, setTotal] = useState(0);
  const [nome, setNome] = useState<string | null>(null);

  const anchorId = me.anchor_card_id ?? null;

  useEffect(() => {
    if (!anchorId) return;

    (async () => {
      const args = {
        p_card_id: anchorId,
        p_reference_date: toISODate(new Date()),
      };

      const [boundsResult, summaryResult, cardResult] = await Promise.all([
        supabase.rpc("card_cycle_bounds", args),
        supabase.rpc("cycle_summary", args),
        supabase.from("cards").select("name").eq("id", anchorId).maybeSingle(),
      ]);

      // Falha aqui não é motivo pra estragar o dashboard: o aviso some.
      if (boundsResult.error) return;

      setBounds(((boundsResult.data ?? []) as CycleBounds[])[0] ?? null);
      setTotal(
        Number(
          ((summaryResult.data ?? []) as CycleSummaryRow[])[0]?.total ?? 0
        )
      );
      setNome((cardResult.data as { name: string } | null)?.name ?? null);
    })();
  }, [supabase, anchorId]);

  if (!anchorId || !bounds) return null;

  const hoje = toISODate(new Date());
  const dias = Math.round(
    (new Date(bounds.cycle_end).getTime() - new Date(hoje).getTime()) /
      86_400_000
  );

  const quando =
    dias <= 0
      ? "Fecha hoje"
      : dias === 1
        ? "Fecha amanhã"
        : `Fecha em ${dias} dias`;

  return (
    <Link
      href="/relatorios/ciclo"
      className="card flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:border-[var(--scope)]"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {quando}
          {nome ? ` · ${nome}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Parcial de {formatDate(bounds.cycle_start)} a{" "}
          {formatDate(bounds.cycle_end)}
          {bounds.due_date && ` · você paga em ${formatDate(bounds.due_date)}`}
        </p>
      </div>
      <span className="money shrink-0 text-lg font-semibold text-[var(--color-out)]">
        {money(total)}
      </span>
    </Link>
  );
}
