"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import type { InviteInfo } from "@/lib/types";

/**
 * Quem abre o link cai aqui — com ou sem sessão. Fora do painel de
 * propósito: ainda não é da casa, não tem nav nem escopo.
 *
 * get_invite é security definer e só devolve nome e cor de quem convidou:
 * dá pra ver o convite sem estar logado. Aceitar exige sessão, e isso quem
 * garante é accept_invite (auth.uid() nulo → erro).
 */
type Estado = "carregando" | "invalido" | "ok";

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [estado, setEstado] = useState<Estado>("carregando");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [logado, setLogado] = useState(false);
  // Já divide casa com alguém: o banco recusaria; melhor avisar antes.
  const [jaDivide, setJaDivide] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: sessao }, convite] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("get_invite", { p_token: token }),
      ]);

      const linha = ((convite.data ?? []) as InviteInfo[])[0] ?? null;
      if (!linha) {
        setEstado("invalido");
        return;
      }
      setInfo(linha);
      setEstado("ok");

      if (sessao.user) {
        setLogado(true);
        // A RLS devolve os perfis da minha casa: mais de um = já divido.
        const { data: perfis } = await supabase.from("profiles").select("id");
        setJaDivide((perfis ?? []).length > 1);
      }
    })();
  }, [supabase, token]);

  async function aceitar() {
    setAceitando(true);
    setError(null);
    const { error: e } = await supabase.rpc("accept_invite", { p_token: token });
    setAceitando(false);
    // As mensagens do banco já vêm em português.
    if (e) return setError(e.message);
    router.replace("/");
    router.refresh();
  }

  const voltarPraCa = `/entrar?next=${encodeURIComponent(`/convite/${token}`)}`;

  return (
    <main className="scope-us flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span
            className="mb-5 block h-1 w-10 rounded-full bg-[var(--color-couple)]"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">RumoFácil</h1>
        </div>

        {estado === "carregando" && (
          <p className="text-sm text-[var(--color-text-dim)]">Abrindo o convite…</p>
        )}

        {estado === "invalido" && (
          <div className="card px-5 py-6">
            <p className="font-semibold">Esse convite não vale mais</p>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              Pode ter vencido, já ter sido usado ou ter sido revogado. Peça um
              novo para quem te convidou.
            </p>
            <Link
              href="/"
              className="mt-4 inline-block text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
            >
              Ir para o app
            </Link>
          </div>
        )}

        {estado === "ok" && info && (
          <div className="flex flex-col gap-4">
            <div className="card px-5 py-6">
              <p className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
                <span
                  aria-hidden="true"
                  style={{ background: info.inviter_color }}
                  className="inline-block h-2.5 w-2.5 rounded-full"
                />
                {info.inviter_name.split(" ")[0]} te convidou
              </p>
              <p className="mt-2 text-xl font-bold">{info.household_name}</p>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">
                {info.member_count === 1
                  ? "1 pessoa na casa"
                  : `${info.member_count} pessoas na casa`}{" "}
                · vale até {formatDate(info.expires_at)}
                {info.email_locked && " · só para um e-mail específico"}
              </p>
              <p className="mt-3 text-xs text-[var(--color-text-faint)]">
                Ao entrar, seus lançamentos vêm com você e passam a contar na
                visão de todos da casa.
              </p>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-2.5 text-sm text-[var(--color-out)]"
              >
                {error}
              </p>
            )}

            {!logado ? (
              <>
                <Link
                  href={voltarPraCa}
                  className="flex min-h-11 items-center justify-center rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)]"
                >
                  Entrar para aceitar
                </Link>
                <p className="text-center text-xs text-[var(--color-text-faint)]">
                  Não tem conta? Na próxima tela, escolha &ldquo;Criar
                  conta&rdquo; — você volta para cá depois.
                </p>
              </>
            ) : jaDivide ? (
              <div className="card px-5 py-4">
                <p className="text-sm">
                  Você já está em uma casa com outras pessoas. Para aceitar,
                  saia dela primeiro em{" "}
                  <Link href="/ajustes" className="underline">
                    Ajustes → Minha casa
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={aceitar}
                disabled={aceitando}
                className="min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
              >
                {aceitando ? "Entrando…" : "Entrar na casa"}
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
