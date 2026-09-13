import { NextResponse } from "next/server";
import { createClient as criarClienteSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { r2Configurado } from "@/lib/r2";

/**
 * O que as rotas de recibo têm em comum. SÓ DO SERVIDOR.
 */

/**
 * Teto do arquivo que chega no R2. A foto é comprimida no navegador pra
 * algumas centenas de KB (lib/imagem.ts); 3 MB é folga pro caso de a
 * compressão não rodar, não meta.
 */
export const TAMANHO_MAXIMO = 3 * 1024 * 1024;

export const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Recibos só ligam com R2 E a chave secreta do Supabase: é com ela que o
 * servidor marca o envio como conferido (uploaded_at não é editável por
 * quem está logado — migração 009, parte 4).
 */
export function recibosAtivos() {
  return r2Configurado() && Boolean(process.env.SUPABASE_SECRET_KEY);
}

/** Ignora RLS e grants. Só pra gravar o que a pessoa não pode gravar sozinha. */
export function clienteAdmin() {
  return criarClienteSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/**
 * Sessão de quem chamou. O cliente devolvido carrega o token dela, então
 * toda consulta feita com ele passa pela RLS — é o que garante que um
 * recibo de outra pessoa simplesmente não é encontrado.
 */
export async function sessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { supabase, userId } : null;
}

export function erro(mensagem: string, status: number, detalhe?: string) {
  return NextResponse.json(
    detalhe ? { error: mensagem, detalhe: detalhe.slice(0, 300) } : { error: mensagem },
    { status }
  );
}

export const SEM_SESSAO = () => erro("Entre na sua conta.", 401);
export const DESLIGADO = () =>
  erro("Guardar recibos ainda não está configurado neste app.", 503);

/** Colunas que o navegador recebe. r2_key fica de fora: é detalhe do servidor. */
export const COLUNAS_PUBLICAS =
  "id, expense_id, mime_type, size_bytes, occurred_on, notes, uploaded_at, created_at";
