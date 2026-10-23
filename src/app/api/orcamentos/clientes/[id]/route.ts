import { NextResponse } from "next/server";
import { COLUNAS_CLIENTE, abrirPonte, clienteDoCorpo, ehId } from "@/lib/orcamentos";
import { erro } from "@/lib/rotas";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await abrirPonte();
  if (p instanceof Response) return p;
  const { id } = await params;
  if (!ehId(id)) return erro("Cliente não encontrado.", 404);

  let corpo: Record<string, unknown>;
  try {
    corpo = await request.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }
  const campos = clienteDoCorpo(corpo);
  if ("name" in campos && !campos.name) return erro("Diga o nome do cliente.", 400);

  // company_id no filtro: a chave de lá ignora a RLS, então é ele que
  // impede mexer no cliente de outra empresa.
  const { data, error } = await p.db
    .from("clients")
    .update(campos)
    .eq("id", id)
    .eq("company_id", p.companyId)
    .select(COLUNAS_CLIENTE)
    .maybeSingle();
  if (error) return erro("Não deu para salvar o cliente.", 502, error.message);
  if (!data) return erro("Cliente não encontrado.", 404);
  return NextResponse.json({ cliente: data });
}

/** Os orçamentos do cliente continuam: lá eles guardam uma cópia dos dados dele. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = await abrirPonte();
  if (p instanceof Response) return p;
  const { id } = await params;
  if (!ehId(id)) return erro("Cliente não encontrado.", 404);

  const { error } = await p.db.from("clients").delete().eq("id", id).eq("company_id", p.companyId);
  if (error) return erro("Não deu para apagar o cliente.", 502, error.message);
  return new NextResponse(null, { status: 204 });
}
