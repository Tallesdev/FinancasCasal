import { NextResponse } from "next/server";
import { createClient as criarClienteSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** O que toda rota de API precisa. SÓ DO SERVIDOR. */

/**
 * Sessão de quem chamou. O cliente devolvido carrega o token dela, então
 * toda consulta feita com ele passa pela RLS — é o que garante que o dado
 * de outra pessoa simplesmente não é encontrado.
 */
export async function sessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  return userId ? { supabase, userId } : null;
}

/** Ignora RLS e grants. Só pra gravar o que a pessoa não pode gravar sozinha. */
export function clienteAdmin() {
  return criarClienteSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export function erro(mensagem: string, status: number, detalhe?: string) {
  return NextResponse.json(
    detalhe ? { error: mensagem, detalhe: detalhe.slice(0, 300) } : { error: mensagem },
    { status }
  );
}

export const SEM_SESSAO = () => erro("Entre na sua conta.", 401);
