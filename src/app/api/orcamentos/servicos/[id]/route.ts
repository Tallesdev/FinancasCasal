import { NextResponse } from "next/server";
import { COLUNAS_SERVICO, abrirPonte, ehId, texto } from "@/lib/orcamentos";
import { erro } from "@/lib/rotas";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await abrirPonte();
  if (p instanceof Response) return p;
  const { id } = await params;
  if (!ehId(id)) return erro("Serviço não encontrado.", 404);

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }
  const campos: Record<string, unknown> = {};
  if ("name" in corpo) {
    const name = texto(corpo.name, 160);
    if (!name) return erro("Diga o nome do serviço.", 400);
    campos.name = name;
  }
  if ("description" in corpo) campos.description = texto(corpo.description, 2000);
  if ("price" in corpo) {
    const price = Number(corpo.price);
    if (!Number.isFinite(price) || price < 0) return erro("Preço inválido.", 400);
    campos.price = Math.round(price * 100) / 100;
  }

  const { data, error } = await p.db
    .from("catalog_items")
    .update(campos)
    .eq("id", id)
    .eq("company_id", p.companyId)
    .select(COLUNAS_SERVICO)
    .maybeSingle();
  if (error) return erro("Não deu para salvar o serviço.", 502, error.message);
  if (!data) return erro("Serviço não encontrado.", 404);
  return NextResponse.json({ servico: data });
}

/** Igual ao app de orçamentos: não apaga, arquiva (orçamentos antigos citam o item). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await abrirPonte();
  if (p instanceof Response) return p;
  const { id } = await params;
  if (!ehId(id)) return erro("Serviço não encontrado.", 404);

  const { error } = await p.db
    .from("catalog_items")
    .update({ active: false })
    .eq("id", id)
    .eq("company_id", p.companyId);
  if (error) return erro("Não deu para arquivar o serviço.", 502, error.message);
  return new NextResponse(null, { status: 204 });
}
