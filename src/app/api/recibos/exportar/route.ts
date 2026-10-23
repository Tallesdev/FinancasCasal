import { NextResponse } from "next/server";
import JSZip from "jszip";
import { baixarObjeto } from "@/lib/r2";
import {
  DESLIGADO,
  EXTENSAO,
  SEM_SESSAO,
  erro,
  recibosAtivos,
  sessao,
} from "@/lib/recibos-servidor";

export const runtime = "nodejs";
export const maxDuration = 60;

type ReciboParaExportar = {
  user_id: string;
  r2_key: string;
  mime_type: string;
  occurred_on: string;
  notes: string | null;
  expenses: {
    description: string;
    amount: number;
    categories: { name: string } | null;
  } | null;
  /** Comprovante de recebimento (migração 022). */
  incomes: { source: string; amount: number; client: string | null } | null;
  profiles: { display_name: string } | null;
};

/**
 * Baixa recibos (confirmados) num .zip. Monta tudo em memória: pro volume
 * de uso pessoal/pequena empresa isso basta, sem a complexidade de uma
 * resposta em streaming.
 *
 * Sem parâmetro: backup das fotos da PESSOA logada (Ajustes → Baixar meus
 * dados). Só as dela, mesmo na empresa — portabilidade é do titular.
 *
 * ?mes=AAAA-MM: as notas daquele mês pro contador (FASE_F.md, F6.2). Na
 * empresa vêm as dos sócios também (a RLS da 018 decide), com um
 * resumo.csv que o Excel abre direto.
 */
export async function GET(request: Request) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  const mes = new URL(request.url).searchParams.get("mes");
  if (mes !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes))
    return erro("Mês inválido.", 400);

  let consulta = s.supabase
    .from("receipts")
    .select(
      "user_id, r2_key, mime_type, occurred_on, notes, expenses(description, amount, categories(name)), incomes(source, amount, client), profiles(display_name)"
    )
    .not("uploaded_at", "is", null)
    .order("occurred_on");

  if (mes) {
    const [ano, m] = mes.split("-").map(Number);
    const fim = new Date(Date.UTC(ano, m, 0)).toISOString().slice(0, 10);
    consulta = consulta.gte("occurred_on", `${mes}-01`).lte("occurred_on", fim);
  } else {
    consulta = consulta.eq("user_id", s.userId);
  }

  const { data: recibos, error: erroConsulta } = await consulta;

  if (erroConsulta) return erro("Não deu para listar os recibos.", 500);
  if (!recibos || recibos.length === 0)
    return erro(mes ? "Nenhum recibo nesse mês." : "Nenhum recibo para exportar ainda.", 404);

  const zip = new JSZip();
  const usados = new Map<string, number>();
  const linhas: string[][] = [
    ["data", "tipo", "descricao", "valor", "categoria", "cliente", "enviado_por", "observacao", "arquivo"],
  ];

  for (const r of recibos as unknown as ReciboParaExportar[]) {
    const ext = EXTENSAO[r.mime_type] ?? "jpg";
    const pasta = mes ? "" : `${r.occurred_on.slice(0, 4)}/`;
    const base = `${r.occurred_on}_${slug(r.expenses?.description ?? r.incomes?.source)}`;
    const n = usados.get(base) ?? 0;
    usados.set(base, n + 1);
    const nome = `${pasta}${base}${n > 0 ? `-${n + 1}` : ""}.${ext}`;

    const { dados } = await baixarObjeto(r.r2_key);
    zip.file(nome, Buffer.from(dados));

    const valor = r.expenses?.amount ?? r.incomes?.amount;
    linhas.push([
      r.occurred_on.split("-").reverse().join("/"),
      r.expenses ? "gasto" : r.incomes ? "recebimento" : "",
      r.expenses?.description ?? r.incomes?.source ?? "(sem lançamento)",
      valor != null ? Number(valor).toFixed(2).replace(".", ",") : "",
      r.expenses?.categories?.name ?? "",
      r.incomes?.client ?? "",
      r.profiles?.display_name ?? "",
      r.notes ?? "",
      nome,
    ]);
  }

  if (mes) {
    // ; e vírgula decimal: é o que o Excel em português abre sem perguntar.
    // BOM no começo pra acentuação sair certa.
    const csv = linhas.map((l) => l.map(celula).join(";")).join("\r\n");
    zip.file("resumo.csv", "﻿" + csv);
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const nomeZip = mes ? `notas-${mes}.zip` : `recibos-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeZip}"`,
    },
  });
}

/** Célula de CSV: aspas quando precisa, e nada que vire fórmula no Excel. */
function celula(valor: string) {
  let v = valor;
  if (/^[=+\-@]/.test(v) && !/^-?\d/.test(v)) v = `'${v}`;
  return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Nome de arquivo seguro a partir da descrição do gasto, sem acento. */
function slug(descricao?: string) {
  const s = (descricao ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "sem-descricao";
}
