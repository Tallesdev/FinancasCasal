import { NextResponse } from "next/server";
import { createClient as criarClienteSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** O que a pessoa digita pra confirmar. Não é segurança — é intenção. */
const PALAVRA = "EXCLUIR";

const semSessao = { auth: { persistSession: false, autoRefreshToken: false } };

/**
 * Exclui a conta de quem está logado, e tudo o que é dela.
 *
 * Por que uma rota de servidor com a chave secreta, e não uma função SQL:
 * apagar de `auth.users` é mexer no schema de autenticação do Supabase, e o
 * caminho suportado pra isso é a Admin API. Uma função que dependesse de
 * privilégio do role `postgres` em `auth` funcionaria hoje e poderia parar
 * num ajuste de permissão do Supabase — e isto é o direito de exclusão da
 * LGPD, não pode quebrar em silêncio.
 *
 * Conferido no banco em 12/09/2026: auth.users → profiles é CASCADE, e todas
 * as tabelas de dado (expenses, incomes, investments, cards, categories,
 * bank_accounts, household_invites.created_by) apontam pra profiles com
 * CASCADE. Apagar o usuário apaga tudo. A exceção é a casa, que não depende
 * de profiles — tratada abaixo.
 *
 * Três travas, cada uma contra uma coisa:
 *   sessão       → só apaga a própria conta (o id vem da sessão, nunca do corpo)
 *   senha        → celular desbloqueado na mão de outra pessoa
 *   "EXCLUIR"    → toque sem querer
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publica = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const secreta = process.env.SUPABASE_SECRET_KEY;

  if (!secreta) {
    return NextResponse.json(
      {
        error:
          "A exclusão de conta ainda não está configurada neste app. Peça pelo contato da política de privacidade.",
      },
      { status: 503 }
    );
  }

  let corpo: { senha?: unknown; confirmacao?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  if (corpo.confirmacao !== PALAVRA) {
    return NextResponse.json(
      { error: `Digite ${PALAVRA} para confirmar.` },
      { status: 400 }
    );
  }
  if (typeof corpo.senha !== "string" || !corpo.senha) {
    return NextResponse.json({ error: "Digite sua senha." }, { status: 400 });
  }

  // Reautenticação sem e-mail: um cliente descartável tenta entrar com a
  // senha digitada. Não usa o remetente do Supabase, que já é gargalo.
  const verificador = criarClienteSupabase(url, publica, semSessao);
  const { error: senhaErrada } = await verificador.auth.signInWithPassword({
    email: user.email,
    password: corpo.senha,
  });
  if (senhaErrada) {
    return NextResponse.json({ error: "Senha não confere." }, { status: 403 });
  }

  // A chave secreta ignora RLS. Só existe dentro desta função.
  const admin = criarClienteSupabase(url, secreta, semSessao);

  // A casa precisa ser lida ANTES: o perfil que diz qual é some com a exclusão.
  const { data: perfil } = await admin
    .from("profiles")
    .select("household_id")
    .eq("id", user.id)
    .maybeSingle();
  const casa = (perfil?.household_id as string | null) ?? null;

  // Fase E: apagar do R2 os objetos com prefixo `${user.id}/` aqui, ANTES de
  // apagar o usuário. Depois disso some a linha que diz quais arquivos existem.

  const { error: falha } = await admin.auth.admin.deleteUser(user.id);
  if (falha) {
    console.error("[api/conta/excluir]", falha.message);
    return NextResponse.json(
      { error: "Não deu para excluir a conta agora. Nada foi apagado; tente de novo." },
      { status: 500 }
    );
  }

  // O cascade levou perfil e dados. A casa não depende de perfil: se ficou
  // sem ninguém, apagar aqui evita casa fantasma (e os convites dela vão
  // junto, por cascade).
  if (casa) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("household_id", casa);
    if (!count) await admin.from("households").delete().eq("id", casa);
  }

  // O usuário já não existe; só limpa os cookies deste navegador.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Sessão de usuário apagado: não há o que revogar.
  }

  return NextResponse.json({ ok: true });
}
