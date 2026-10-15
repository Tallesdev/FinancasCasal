"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firstDayOfMonth, toISODate } from "@/lib/format";
import { chaveGuardada, guardar, lerGuardado } from "@/lib/guardado";
import { nadaCarregando } from "@/lib/medidor";
import {
  buscarGastos,
  buscarInicioBase,
  buscarInicioMes,
  buscarInvestimentos,
  buscarLucro,
  buscarLucroPorCliente,
  buscarRelatorio,
  buscarRenda,
} from "@/lib/telas";
import { useScope } from "./ScopeProvider";

/** As abas de baixo, nas duas versões do app. */
const ABAS_CASA = ["/", "/gastos", "/renda", "/investimentos", "/relatorios"];
const ABAS_EMPRESA = ["/", "/gastos", "/renda", "/lucro", "/relatorios"];

/**
 * Prepara por trás as abas de baixo assim que o app abre (FASE_F.md, F8.6),
 * pra até a primeira visita a cada uma abrir pronta:
 * - a tela em si, do servidor (prefetch completo do Next). As telas só têm
 *   dados do lado do navegador, então o que fica guardado não tem nada de
 *   ninguém;
 * - os dados de cada uma, do banco. A tela continua conferindo o novo
 *   quando abre (lib/guardado.ts).
 *
 * Só começa depois que a tela aberta terminou de carregar, pra não
 * disputar a rede do celular com o que a pessoa está olhando. E só busca
 * o que ainda não está guardado.
 */
export function PreCarregar() {
  const { me, members, household, empresa, recursos } = useScope();
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    let espera: ReturnType<typeof setTimeout>;

    const buscarTudo = async () => {
      for (const aba of empresa ? ABAS_EMPRESA : ABAS_CASA) {
        router.prefetch(aba, { kind: "full" } as unknown as Parameters<typeof router.prefetch>[1]);
      }

      const supabase = createClient();
      const mes = firstDayOfMonth(toISODate(new Date()));
      const ano = new Date().getFullYear();
      const chave = (...partes: (string | number)[]) =>
        chaveGuardada(me.id, household?.id, ...partes);

      const tarefas: [string, () => Promise<unknown>][] = [
        [chave("inicio", mes), () => buscarInicioMes(supabase, { month: mes, empresa })],
        [chave("inicio-base"), () => buscarInicioBase(supabase, me.id)],
        [
          chave("gastos", mes),
          () => buscarGastos(supabase, { month: mes, meId: me.id, empresa, recibos: recursos.recibos }),
        ],
        [chave("renda"), () => buscarRenda(supabase, empresa)],
        [chave("relatorios", ano), () => buscarRelatorio(supabase, ano)],
      ];
      if (empresa) {
        // Empresa troca Investir por Lucro, e Relatórios tem o lucro por cliente.
        const socios = members.map((m) => m.id);
        tarefas.push(
          [chave("lucro", ano), () => buscarLucro(supabase, ano)],
          [chave("lucro-por-cliente", ano), () => buscarLucroPorCliente(supabase, ano, socios)]
        );
      } else {
        tarefas.push([chave("investimentos"), () => buscarInvestimentos(supabase)]);
      }

      await Promise.all(
        tarefas
          .filter(([k]) => lerGuardado(k) === undefined)
          .map(async ([k, buscar]) => {
            const dados = await buscar().catch(() => null);
            // A própria tela pode ter guardado algo mais novo enquanto isso.
            if (dados && !cancelado && lerGuardado(k) === undefined) guardar(k, dados);
          })
      );
    };

    // Espera a tela aberta ficar pronta (sem "Carregando…") e mais um tempo.
    const quandoPronta = () => {
      if (cancelado) return;
      if (nadaCarregando()) buscarTudo();
      else espera = setTimeout(quandoPronta, 400);
    };
    espera = setTimeout(quandoPronta, 1200);

    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [router, me.id, members, household?.id, empresa, recursos.recibos]);

  return null;
}
