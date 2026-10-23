import { NextResponse } from "next/server";
import { COLUNAS_CLIENTE, abrirPonte, clienteDoCorpo } from "@/lib/orcamentos";
import { erro } from "@/lib/rotas";

export const runtime = "nodejs";

/**
 * Clientes da empresa — os MESMOS do app de orçamentos (C28). Quem cadastra
 * aqui aparece lá, e vice-versa.
 */
export async function GET() {
  const p = await abrirPonte();
  if (p instanceof Response) return p;

  const { data, error } = await p.db
    .from("clients")
    .select(COLUNAS_CLIENTE)
    .eq("company_id", p.companyId)
    .order("name");
  if (error) return erro("Não deu para carregar os clientes.", 502, error.message);
  return NextResponse.json({ clientes: data });
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
  const campos = clienteDoCorpo(corpo);
  if (!campos.name) return erro("Diga o nome do cliente.", 400);

  // O código (#0012) é dado pelo banco de lá; o 0 é só pra passar no "not null".
  const { data, error } = await p.db
    .from("clients")
    .insert({ ...campos, company_id: p.companyId, code: 0 })
    .select(COLUNAS_CLIENTE)
    .single();
  if (error || !data) return erro("Não deu para salvar o cliente.", 502, error?.message);
  return NextResponse.json({ cliente: data });
}
