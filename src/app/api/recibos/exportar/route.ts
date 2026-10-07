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
  r2_key: string;
  mime_type: string;
  occurred_on: string;
  expenses: { description: string } | null;
};

/**
 * Baixa todos os recibos (confirmados) da pessoa logada num .zip — backup
 * das fotos em si, fora do app. Monta tudo em memória: pro volume de uso
 * pessoal/pequena empresa isso basta, sem a complexidade de uma resposta
 * em streaming.
 */
export async function GET() {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  const { data: recibos, error: erroConsulta } = await s.supabase
    .from("receipts")
    .select("r2_key, mime_type, occurred_on, expenses(description)")
    .not("uploaded_at", "is", null)
    .order("occurred_on");

  if (erroConsulta) return erro("Não deu para listar os recibos.", 500);
  if (!recibos || recibos.length === 0)
    return erro("Nenhum recibo para exportar ainda.", 404);

  const zip = new JSZip();
  const usados = new Map<string, number>();

  for (const r of recibos as unknown as ReciboParaExportar[]) {
    const ext = EXTENSAO[r.mime_type] ?? "jpg";
    const ano = r.occurred_on.slice(0, 4);
    const base = `${r.occurred_on}_${slug(r.expenses?.description)}`;
    const n = usados.get(base) ?? 0;
    usados.set(base, n + 1);
    const nome = `${ano}/${base}${n > 0 ? `-${n + 1}` : ""}.${ext}`;

    const { dados } = await baixarObjeto(r.r2_key);
    zip.file(nome, Buffer.from(dados));
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="recibos-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
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
