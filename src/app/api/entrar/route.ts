import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clienteAdmin, erro } from "@/lib/rotas";

export const runtime = "nodejs";

/** Mesma resposta pra usuário que não existe e senha errada. */
const NAO_CONFERE = () => erro("Usuário ou senha não conferem. Tente de novo.", 401);

/**
 * Entrar com NOME DE USUÁRIO (FASE_F.md, F1.9). Com e-mail, a tela continua
 * falando direto com o Supabase, como sempre.
 *
 * O Supabase só entende e-mail. Aqui o servidor acha o e-mail do usuário e
 * faz o login ele mesmo, gravando a sessão nos cookies — o e-mail nunca
 * volta pro navegador, então ninguém descobre o e-mail de outra pessoa
 * digitando o usuário dela.
 *
 * Corpo: { usuario, senha }
 */
export async function POST(request: Request) {
  let corpo: { usuario?: unknown; senha?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }

  const usuario = typeof corpo.usuario === "string" ? corpo.usuario.trim().toLowerCase() : "";
  const senha = typeof corpo.senha === "string" ? corpo.senha : "";
  if (!/^[a-z0-9._]{3,30}$/.test(usuario) || !senha) return NAO_CONFERE();

  if (!process.env.SUPABASE_SECRET_KEY) {
    return erro("Entrar com usuário ainda não está configurado. Use o e-mail.", 503);
  }

  const admin = clienteAdmin();
  const { data: perfil } = await admin
    .from("profiles")
    .select("id")
    .eq("username", usuario)
    .maybeSingle();
  if (!perfil) return NAO_CONFERE();

  const { data: dono, error: falhaDono } = await admin.auth.admin.getUserById(perfil.id);
  if (falhaDono || !dono.user?.email) return NAO_CONFERE();

  const supabase = await createClient();
  const { error: falhaLogin } = await supabase.auth.signInWithPassword({
    email: dono.user.email,
    password: senha,
  });

  if (falhaLogin) {
    const m = falhaLogin.message.toLowerCase();
    if (m.includes("email not confirmed")) {
      return erro("Confirme seu e-mail antes de entrar — veja sua caixa de entrada.", 403);
    }
    if (m.includes("rate limit") || m.includes("too many")) {
      return erro("Muitas tentativas seguidas. Espere um minuto e tente de novo.", 429);
    }
    return NAO_CONFERE();
  }

  return new NextResponse(null, { status: 204 });
}
