import { NextResponse } from "next/server";
import { iaConfigurada, lerRecibo } from "@/lib/ia";
import { baixarObjeto } from "@/lib/r2";
import { DESLIGADO, SEM_SESSAO, erro, recibosAtivos, sessao } from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Ler um recibo já guardado com IA (Fase E2). Devolve SUGESTÃO — nada é
 * salvo aqui. A imagem vai do R2 pro servidor e do servidor pra Groq; o
 * navegador não reenvia a foto.
 *
 * Corpo: { categorias: string[] } — as da pessoa, pra casar pelo nome.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();
  if (!iaConfigurada()) return erro("Ler recibo ainda não está configurado neste app.", 503);

  const { id } = await params;

  let categorias: string[] = [];
  try {
    const corpo = (await request.json()) as { categorias?: unknown };
    if (Array.isArray(corpo.categorias)) {
      categorias = corpo.categorias.filter((c): c is string => typeof c === "string").slice(0, 50);
    }
  } catch {
    // Sem categorias a leitura funciona igual, só não sugere categoria.
  }

  const { data: recibo } = await s.supabase
    .from("receipts")
    .select("r2_key, uploaded_at")
    .eq("id", id)
    .maybeSingle();
  if (!recibo) return erro("Recibo não encontrado.", 404);
  if (!recibo.uploaded_at) return erro("O envio desta foto não foi concluído.", 409);

  try {
    const { dados, tipo } = await baixarObjeto(recibo.r2_key);
    const leitura = await lerRecibo(dados, tipo, categorias);
    return NextResponse.json({ leitura });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("[api/recibos/ler]", motivo);
    return erro(
      "Não deu para ler o recibo agora. A foto continua guardada; preencha à mão.",
      502,
      motivo
    );
  }
}
