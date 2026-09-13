"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { Button, ErrorNote } from "./ui";
import { toISODate } from "@/lib/format";
import { TERMOS_VERSAO } from "@/lib/legal";
import { dataCsv, gerarCsv, protegerTexto, valorCsv } from "@/lib/planilha";
import type {
  BankAccount,
  Card,
  Category,
  Expense,
  Income,
  Investment,
} from "@/lib/types";

const RECORRENCIA: Record<string, string> = {
  variable: "avulso",
  fixed_recurring: "mensal",
  fixed_installment: "parcelado",
  one_time: "avulso",
  recurring: "mensal",
};

/**
 * Baixar os próprios dados — o direito de portabilidade da LGPD (art. 18, V).
 *
 * Só o que é DA PESSOA. Os lançamentos das outras pessoas da casa ela vê no
 * app, mas não são dela pra levar embora: exportar dado de terceiro num
 * arquivo de portabilidade seria o contrário do que a lei protege.
 *
 * Dois formatos, pra dois usos:
 *  • JSON: tudo, estruturado — é o que "portabilidade" pede.
 *  • CSV: os lançamentos numa planilha que o Excel abre direto, e que a
 *    tela de importar lê de volta sem ajuste nenhum.
 */
export function ExportarDados() {
  const supabase = useMemo(() => createClient(), []);
  const { me, household } = useScope();
  const [baixando, setBaixando] = useState<"json" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function coletar() {
    const [auth, gastos, rendas, aportes, cartoes, categorias, contas, importacoes, recibos] =
      await Promise.all([
        supabase.auth.getUser(),
        supabase.from("expenses").select("*").eq("user_id", me.id).order("start_date"),
        supabase.from("incomes").select("*").eq("user_id", me.id).order("start_date"),
        supabase.from("investments").select("*").eq("user_id", me.id).order("start_date"),
        supabase.from("cards").select("*").eq("user_id", me.id),
        supabase.from("categories").select("*").eq("user_id", me.id),
        supabase.from("bank_accounts").select("*").eq("user_id", me.id),
        supabase.from("imports").select("*").eq("user_id", me.id),
        // As fotos em si baixam-se em Recibos; aqui vai o registro de cada uma.
        supabase
          .from("receipts")
          .select("id, expense_id, occurred_on, notes, mime_type, size_bytes, uploaded_at, created_at")
          .eq("user_id", me.id),
      ]);

    const falha = [gastos, rendas, aportes, cartoes, categorias, contas].find((r) => r.error);
    if (falha) throw falha.error;

    return {
      email: auth.data.user?.email ?? null,
      gastos: (gastos.data ?? []) as Expense[],
      rendas: (rendas.data ?? []) as Income[],
      aportes: (aportes.data ?? []) as Investment[],
      cartoes: (cartoes.data ?? []) as Card[],
      categorias: (categorias.data ?? []) as Category[],
      contas: (contas.data ?? []) as BankAccount[],
      importacoes: importacoes.data ?? [],
      recibos: recibos.data ?? [],
    };
  }

  async function json() {
    setBaixando("json");
    setError(null);
    try {
      const d = await coletar();
      const conteudo = {
        app: "RumoFácil",
        gerado_em: new Date().toISOString(),
        versao_dos_termos_vigentes: TERMOS_VERSAO,
        perfil: {
          nome: me.display_name,
          email: d.email,
          cor: me.color,
          termos_aceitos: me.terms_version ?? null,
          termos_aceitos_em: me.terms_accepted_at ?? null,
          declarou_maioridade_em: me.adult_declared_at ?? null,
          consentiu_recibos_em: me.receipts_consent_at ?? null,
        },
        // Só a casa em si. Quem mais está nela é dado das outras pessoas.
        casa: household ? { nome: household.name, cor: household.color } : null,
        gastos: d.gastos,
        rendas: d.rendas,
        investimentos: d.aportes,
        cartoes: d.cartoes,
        categorias: d.categorias,
        contas_bancarias: d.contas,
        importacoes: d.importacoes,
        recibos: {
          observacao: "Registro de cada recibo. As fotos se baixam na tela Recibos.",
          itens: d.recibos,
        },
      };
      baixar(
        `rumofacil-meus-dados-${toISODate(new Date())}.json`,
        JSON.stringify(conteudo, null, 2),
        "application/json"
      );
    } catch {
      setError("Não deu para gerar o arquivo. Tente de novo.");
    } finally {
      setBaixando(null);
    }
  }

  async function csv() {
    setBaixando("csv");
    setError(null);
    try {
      const d = await coletar();
      const nomeCategoria = new Map(d.categorias.map((c) => [c.id, c.name]));
      const nomeCartao = new Map(d.cartoes.map((c) => [c.id, c.name]));

      type Linha = (string | number)[];
      const linhas: { data: string; linha: Linha }[] = [];

      for (const g of d.gastos) {
        linhas.push({
          data: g.start_date,
          linha: [
            "gasto",
            dataCsv(g.start_date),
            protegerTexto(g.description),
            valorCsv(g.amount),
            protegerTexto(nomeCategoria.get(g.category_id ?? "") ?? ""),
            g.payment_method === "card" ? "cartao" : "pix",
            protegerTexto(nomeCartao.get(g.card_id ?? "") ?? ""),
            RECORRENCIA[g.kind] ?? "",
            g.installments_total ?? "",
            g.end_date ? dataCsv(g.end_date) : "",
            protegerTexto(g.notes ?? ""),
          ],
        });
      }
      for (const r of d.rendas) {
        linhas.push({
          data: r.start_date,
          linha: [
            "renda", dataCsv(r.start_date), protegerTexto(r.source), valorCsv(r.amount),
            "", "", "", RECORRENCIA[r.kind] ?? "", "",
            r.end_date ? dataCsv(r.end_date) : "", protegerTexto(r.notes ?? ""),
          ],
        });
      }
      for (const v of d.aportes) {
        linhas.push({
          data: v.start_date,
          linha: [
            "investimento", dataCsv(v.start_date), protegerTexto(v.name), valorCsv(v.amount),
            protegerTexto(v.asset_type), "", "", RECORRENCIA[v.kind] ?? "", "",
            v.end_date ? dataCsv(v.end_date) : "", protegerTexto(v.notes ?? ""),
          ],
        });
      }

      linhas.sort((a, b) => a.data.localeCompare(b.data));

      // Os nomes das colunas são os que a importação reconhece sozinha.
      const conteudo = gerarCsv([
        ["tipo", "data", "descricao", "valor", "categoria", "forma", "cartao",
         "recorrencia", "parcelas", "termina_em", "observacao"],
        ...linhas.map((l) => l.linha),
      ]);

      baixar(
        `rumofacil-lancamentos-${toISODate(new Date())}.csv`,
        conteudo,
        "text/csv;charset=utf-8"
      );
    } catch {
      setError("Não deu para gerar a planilha. Tente de novo.");
    } finally {
      setBaixando(null);
    }
  }

  return (
    <section className="card flex flex-col gap-4 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Baixar meus dados</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Tudo o que é seu, num arquivo. Os lançamentos das outras pessoas da casa não entram —
          são delas.
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={csv} disabled={baixando !== null}>
          {baixando === "csv" ? "Gerando…" : "Planilha (CSV)"}
        </Button>
        <Button variant="ghost" onClick={json} disabled={baixando !== null}>
          {baixando === "json" ? "Gerando…" : "Tudo (JSON)"}
        </Button>
      </div>
      <p className="-mt-2 text-xs text-[var(--color-text-faint)]">
        A planilha abre no Excel e pode ser importada de volta. O JSON tem tudo, inclusive
        cartões, contas e categorias.
      </p>
    </section>
  );
}

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
