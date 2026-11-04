"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChaveGuardada, useScope } from "./ScopeProvider";
import { guardar, lerGuardado } from "@/lib/guardado";
import { buscarLucro, type LucroGuardado } from "@/lib/telas";
import { dividirMes, partesValidas, resumoDoAno, type MesDividido } from "@/lib/divisao";
import { toISODate } from "@/lib/format";

/**
 * O lucro da empresa no ano, já dividido mês a mês (FASE_F.md, F3). Fica
 * num lugar só porque a tela Lucro (o mês, pra dividir) e Relatórios (o
 * ano, pra ter noção) mostram os mesmos números (C39).
 *
 * Sempre a empresa inteira: o seletor de sócio não muda o lucro.
 */
export function useLucro(ano: number) {
  const supabase = useMemo(() => createClient(), []);
  const { members, empresa } = useScope();

  // O que esta tela tinha da última vez (lib/guardado.ts): aparece na hora,
  // e o load() confere o novo por trás.
  const chave = useChaveGuardada("lucro", ano);
  const [dados, setDados] = useState<LucroGuardado | null>(() => lerGuardado<LucroGuardado>(chave) ?? null);
  const [loading, setLoading] = useState(!dados);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => members.map((m) => m.id), [members]);

  const load = useCallback(async () => {
    if (!empresa) return;
    const guardado = lerGuardado<LucroGuardado>(chave);
    if (guardado) {
      setDados(guardado);
      setLoading(false);
    } else {
      setDados(null);
      setLoading(true);
    }
    const novos = await buscarLucro(supabase, ano);
    if (!novos) {
      setError("Não deu para carregar o lucro do ano.");
      setLoading(false);
      return;
    }
    setError(null);
    guardar(chave, novos);
    setDados(novos);
    setLoading(false);
  }, [supabase, empresa, chave, ano]);

  useEffect(() => {
    load();
  }, [load]);

  const salvas = useMemo(() => dados?.salvas ?? [], [dados]);
  const reservaPct = dados?.reservaPct ?? 0;
  const retiradas = useMemo(() => dados?.retiradas ?? [], [dados]);
  const pronto = dados?.pronto ?? true;

  const partes = useMemo(() => partesValidas(salvas, ids), [salvas, ids]);
  const divisaoDefinida =
    salvas.length > 0 && partes.every((p) => salvas.some((s) => s.user_id === p.user_id));

  /** Meses do ano até o mês atual (ano passado: os 12). */
  const meses: MesDividido[] = useMemo(() => {
    const hoje = toISODate(new Date());
    const anoHoje = Number(hoje.slice(0, 4));
    const ultimo = ano < anoHoje ? 12 : ano > anoHoje ? 0 : Number(hoje.slice(5, 7));
    const summary = dados?.summary ?? [];
    const lista: MesDividido[] = [];
    for (let i = 1; i <= ultimo; i++) {
      const mes = `${ano}-${String(i).padStart(2, "0")}-01`;
      let faturou = 0;
      let gastou = 0;
      // Empresa inteira: soma todos os sócios, independente do seletor.
      for (const row of summary) {
        if (row.month.slice(0, 7) !== mes.slice(0, 7) || !ids.includes(row.user_id)) continue;
        faturou += Number(row.income);
        gastou += Number(row.expense) + Number(row.investment);
      }
      lista.push(dividirMes(mes, faturou, gastou, reservaPct, partes));
    }
    return lista;
  }, [ano, dados, ids, reservaPct, partes]);

  const resumo = useMemo(() => resumoDoAno(meses, partes, retiradas), [meses, partes, retiradas]);

  return { loading, error, load, pronto, partes, divisaoDefinida, reservaPct, retiradas, meses, resumo };
}
