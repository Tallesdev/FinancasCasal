import { NextResponse } from "next/server";
import {
  COLUNAS_PUBLICAS,
  DESLIGADO,
  EXTENSAO,
  GRANDE_DEMAIS,
  SEM_SESSAO,
  TIPO_RECUSADO,
  erro,
  recibosAtivos,
  sessao,
  tamanhoMaximo,
} from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Passo 1 do envio: confere tipo, tamanho e consentimento e cria a linha do
 * recibo. A foto (ou o PDF) vem no passo 2, por /api/recibos/[id]/enviar.
 *
 * Corpo: { tipo, tamanho, data (AAAA-MM-DD), expense_id?, income_id? }
 */
export async function POST(request: Request) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  let corpo: {
    tipo?: unknown;
    tamanho?: unknown;
    data?: unknown;
    expense_id?: unknown;
    income_id?: unknown;
  };
  try {
    corpo = await request.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }

  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  const ext = EXTENSAO[tipo];
  if (!ext) return erro(TIPO_RECUSADO, 415);

  const tamanho = Number(corpo.tamanho);
  if (!Number.isFinite(tamanho) || tamanho <= 0) return erro("Arquivo vazio.", 400);
  if (tamanho > tamanhoMaximo(tipo)) return erro(GRANDE_DEMAIS(tipo), 413);

  const data =
    typeof corpo.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.data)
      ? corpo.data
      : new Date().toISOString().slice(0, 10);

  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
  const expenseId = uuid(corpo.expense_id);
  // Comprovante de recebimento (migração 022). Um lançamento só por recibo.
  const incomeId = expenseId ? null : uuid(corpo.income_id);

  // O consentimento é conferido AQUI, não só na tela: recibo pode ter dado de
  // saúde, e sem consentimento o servidor não aceita guardar. (LGPD art. 11)
  const { data: perfil } = await s.supabase
    .from("profiles")
    .select("receipts_consent_at")
    .eq("id", s.userId)
    .maybeSingle();
  if (!perfil?.receipts_consent_at) {
    return erro("Para guardar recibos, permita antes em Ajustes → Recibos.", 403);
  }

  // <user_id>/<ano>/<uuid>.<ext> — o id na frente é o que deixa apagar
  // tudo de uma pessoa por prefixo (FASE_E.md §3.3). O banco confere.
  const chave = `${s.userId}/${data.slice(0, 4)}/${crypto.randomUUID()}.${ext}`;

  // A linha nasce antes do arquivo: assim nunca existe arquivo sem linha.
  const { data: recibo, error: falha } = await s.supabase
    .from("receipts")
    .insert({
      r2_key: chave,
      mime_type: tipo,
      occurred_on: data,
      expense_id: expenseId,
      ...(incomeId ? { income_id: incomeId } : {}),
    })
    .select(COLUNAS_PUBLICAS)
    .single();

  if (falha || !recibo) {
    console.error("[api/recibos/assinar]", falha?.message);
    return erro("Não deu para preparar o envio.", 500, falha?.message);
  }

  return NextResponse.json({ recibo });
}
