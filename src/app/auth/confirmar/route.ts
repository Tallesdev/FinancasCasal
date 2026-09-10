import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino do link do e-mail de confirmação de cadastro.
 *
 * O Supabase manda a pessoa para cá com um `code` na URL. Este código
 * ainda não é uma sessão — precisa ser trocado por uma, e isso só dá para
 * fazer no servidor, onde os cookies são gravados. Sem esta rota, a pessoa
 * clica no link e cai na tela de login como se nada tivesse acontecido.
 *
 * Reaproveita o createClient() de servidor: os mesmos manipuladores de
 * cookie que sustentam o login por senha sustentam isto.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  // Link vencido, já usado, ou sem código. A tela de login explica.
  return NextResponse.redirect(`${origin}/entrar?erro=confirmacao`);
}
