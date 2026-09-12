import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** O tipo que o @supabase/ssr entrega ao setAll. */
type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * `next` só é honrado se for caminho relativo dentro do app. Sem isto vira
 * "open redirect": link que parece do app e manda a pessoa pra outro site.
 */
export function caminhoSeguro(next: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

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
  // /convite/ também: a pessoa pode chegar sem sessão e precisa VER o
  // convite antes de decidir entrar. Aceitar exige sessão, mas isso quem
  // garante é a função do banco (auth.uid() nulo → erro), não o middleware.
  // /api/ também fica de fora do redirect: rota de API responde 401, não
  // manda pra tela de login. Cada handler checa a própria sessão.
  const path = request.nextUrl.pathname;
  const isPublica =
    path.startsWith("/entrar") ||
    path.startsWith("/auth/") ||
    path === "/convite" ||
    path.startsWith("/convite/") ||
    path.startsWith("/api/");

  if (!user && !isPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    return NextResponse.redirect(url);
  }

  // Quem já está logado não tem o que fazer na tela de login. As rotas
  // /auth/ ficam de fora: elas são justamente quem cria a sessão.
  if (user && request.nextUrl.pathname.startsWith("/entrar")) {
    const url = request.nextUrl.clone();
    // Quem já está logado e veio de um convite volta pro convite.
    url.pathname = caminhoSeguro(request.nextUrl.searchParams.get("next")) ?? "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
