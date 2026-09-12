import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino do link de "esqueci minha senha".
 *
 * Existe separada de /auth/confirmar por um motivo concreto: a primeira
 * tentativa usava `/auth/confirmar?next=/auth/redefinir`, e o link do
 * e-mail levava a pessoa direto pra home, já logada, sem passar pela tela
 * de trocar a senha. A query string no `redirectTo` não sobreviveu à
 * validação de Redirect URLs do Supabase — ele caiu no Site URL, e o
 * `code` na raiz virou sessão sozinho.
 *
 * Uma URL limpa, sem query, não tem esse problema.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/auth/redefinir`);
  }

  return NextResponse.redirect(`${origin}/entrar?erro=recuperacao`);
}
