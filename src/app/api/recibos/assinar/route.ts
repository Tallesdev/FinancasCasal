import { NextResponse } from "next/server";
import { assinarEnvio } from "@/lib/r2";
import {
  COLUNAS_PUBLICAS,
  DESLIGADO,
  EXTENSAO,
  SEM_SESSAO,
  TAMANHO_MAXIMO,
  erro,
  recibosAtivos,
  sessao,
} from "@/lib/recibos-servidor";

export const runtime = "nodejs";

/**
 * Passo 1 do envio: cria a linha do recibo e devolve um link pro navegador
 * subir o arquivo DIRETO no R2 (FASE_E.md §3.1). O arquivo nunca passa pela
 * Vercel — o servidor só decide se pode.
 *
 * Corpo: { tipo, tamanho, data (AAAA-MM-DD), expense_id? }
 */
export async function POST(request: Request) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!recibosAtivos()) return DESLIGADO();

  let corpo: { tipo?: unknown; tamanho?: unknown; data?: unknown; expense_id?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }

  const tipo = typeof corpo.tipo === "string" ? corpo.tipo : "";
  const ext = EXTENSAO[tipo];
  if (!ext) return erro("Envie uma foto (JPEG, PNG ou WebP).", 415);

  const tamanho = Number(corpo.tamanho);
  if (!Number.isFinite(tamanho) || tamanho <= 0) return erro("Arquivo vazio.", 400);
  if (tamanho > TAMANHO_MAXIMO) return erro("Foto grande demais, mesmo depois de comprimir.", 413);

  const data =
    typeof corpo.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.data)
      ? corpo.data
      : new Date().toISOString().slice(0, 10);

  const expenseId =
    typeof corpo.expense_id === "string" && /^[0-9a-f-]{36}$/.test(corpo.expense_id)
      ? corpo.expense_id
      : null;

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
    .insert({ r2_key: chave, mime_type: tipo, occurred_on: data, expense_id: expenseId })
    .select(COLUNAS_PUBLICAS)
    .single();

  if (falha || !recibo) {
    console.error("[api/recibos/assinar]", falha?.message);
    return erro("Não deu para preparar o envio.", 500, falha?.message);
  }

  return NextResponse.json({ recibo, url: await assinarEnvio(chave, tipo) });
}
