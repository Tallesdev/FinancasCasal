import { NextResponse } from "next/server";
import { assinarLeitura } from "@/lib/r2";
import { DESLIGADO, SEM_SESSAO, erro, recibosAtivos, sessao } from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Ver ou baixar um recibo. Responde com redirecionamento pra um link
 * assinado de poucos minutos — por isso serve direto num <img src>.
 *
 * ?baixar=1 → o navegador baixa em vez de abrir.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  const { id } = await params;

  const { data: recibo } = await s.supabase
    .from("receipts")
    .select("r2_key, occurred_on")
    .eq("id", id)
    .maybeSingle();
  if (!recibo) return erro("Recibo não encontrado.", 404);

  const baixar = new URL(request.url).searchParams.get("baixar") === "1";
  const ext = recibo.r2_key.split(".").pop() ?? "jpg";
  const url = await assinarLeitura(
    recibo.r2_key,
    baixar ? `recibo-${recibo.occurred_on}-${id.slice(0, 8)}.${ext}` : undefined
  );

  const resposta = NextResponse.redirect(url, 302);
  // O link vale 5 min; guardar 4 evita reassinar a cada miniatura renderizada.
  // private: nunca num cache compartilhado.
  resposta.headers.set("Cache-Control", "private, max-age=240");
  return resposta;
}
