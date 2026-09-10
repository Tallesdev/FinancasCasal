import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** O tipo que o @supabase/ssr entrega ao setAll. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /auth/* é pública de propósito: é onde o link do e-mail de confirmação
  // troca o código por sessão — nesse momento ainda não existe sessão.
  const isPublica =
    request.nextUrl.pathname.startsWith("/entrar") ||
    request.nextUrl.pathname.startsWith("/auth/");

  if (!user && !isPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    return NextResponse.redirect(url);
  }

  // Quem já está logado não tem o que fazer na tela de login. As rotas
  // /auth/ ficam de fora: elas são justamente quem cria a sessão.
  if (user && request.nextUrl.pathname.startsWith("/entrar")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
