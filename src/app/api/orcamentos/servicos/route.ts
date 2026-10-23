import { NextResponse } from "next/server";
import { COLUNAS_SERVICO, abrirPonte, texto } from "@/lib/orcamentos";
import { erro } from "@/lib/rotas";

export const runtime = "nodejs";

/**
 * Serviços pré-cadastrados — o catálogo do app de orçamentos (C28). Lá ele
 * tem também produtos (material); aqui só interessam serviços e kits, que
 * é o que se combina com o cliente.
 */
export async function GET() {
  const p = await abrirPonte();
  if (p instanceof Response) return p;

  const { data, error } = await p.db
    .from("catalog_items")
    .select(COLUNAS_SERVICO)
    .eq("company_id", p.companyId)
    .eq("active", true)
    .in("kind", ["servico", "kit"])
    .order("use_count", { ascending: false })
    .order("name");
  if (error) return erro("Não deu para carregar os serviços.", 502, error.message);
  return NextResponse.json({ servicos: data });
}

export async function POST(request: Request) {
  const p = await abrirPonte();
  if (p instanceof Response) return p;

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }
  const name = texto(corpo.name, 160);
  if (!name) return erro("Diga o nome do serviço.", 400);
  const price = Number(corpo.price);

  const { data, error } = await p.db
    .from("catalog_items")
    .insert({
      company_id: p.companyId,
      kind: "servico",
      name,
      description: texto(corpo.description, 2000),
      unit: texto(corpo.unit, 20) ?? "un",
      price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
    })
    .select(COLUNAS_SERVICO)
    .single();
  if (error || !data) return erro("Não deu para salvar o serviço.", 502, error?.message);
  return NextResponse.json({ servico: data });
}
