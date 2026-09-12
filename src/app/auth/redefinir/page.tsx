"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/form/Field";

/**
 * Onde o link de "esqueci minha senha" termina.
 *
 * O e-mail leva pra /auth/nova-senha: a rota troca o código por sessão e
 * manda pra cá. Então quem chega aqui JÁ está logado — só falta escolher a
 * senha nova. Sem sessão, o link não serviu.
 *
 * Quem já está logado não precisa deste caminho: troca direto em
 * Ajustes → Meu perfil.
 */
type Estado = "verificando" | "sem-sessao" | "pronto" | "feito";

export default function RedefinirPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [estado, setEstado] = useState<Estado>("verificando");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEstado(data.user ? "pronto" : "sem-sessao");
    });
  }, [supabase]);

  async function salvar() {
    setError(null);
    if (senha.length < 6)
      return setError("A senha precisa ter pelo menos 6 caracteres.");
    if (senha !== confirma) return setError("As duas senhas não batem.");

    setSaving(true);
    const { error: e } = await supabase.auth.updateUser({ password: senha });
    setSaving(false);

    if (e) {
      const m = e.message.toLowerCase();
      setError(
        m.includes("different from the old")
          ? "A senha nova precisa ser diferente da antiga."
          : "Não deu para salvar a senha. Tente de novo."
      );
      return;
    }

    setEstado("feito");
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
  }

  return (
    <main className="scope-us flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span
            className="mb-5 block h-1 w-10 rounded-full bg-[var(--color-couple)]"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">Nova senha</h1>
        </div>

        {estado === "verificando" && (
          <p className="text-sm text-[var(--color-text-dim)]">Um instante…</p>
        )}

        {estado === "sem-sessao" && (
          <div className="card px-5 py-6">
            <p className="font-semibold">Esse link não vale mais</p>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              Pode ter vencido ou já ter sido usado. Peça outro em
              &ldquo;Esqueci minha senha&rdquo; na tela de entrada. Se você já
              está logado no app, dá pra trocar direto em Ajustes &rarr; Meu
              perfil.
            </p>
            <div className="mt-4 flex flex-wrap gap-4">
              <Link
                href="/entrar"
                className="text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
              >
                Tela de entrada
              </Link>
              <Link
                href="/ajustes"
                className="text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
              >
                Ajustes
              </Link>
            </div>
          </div>
        )}

        {estado === "feito" && (
          <div className="card px-5 py-6">
            <p className="font-semibold">Senha trocada</p>
            <p className="mt-2 text-sm text-[var(--color-text-dim)]">
              Levando você para o app…
            </p>
          </div>
        )}

        {estado === "pronto" && (
          <div className="flex flex-col gap-4">
            <PasswordField
              label="Nova senha"
              autoComplete="new-password"
              value={senha}
              autoFocus
              onChange={(event) => setSenha(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && salvar()}
            />
            <PasswordField
              label="Repita a nova senha"
              autoComplete="new-password"
              value={confirma}
              onChange={(event) => setConfirma(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && salvar()}
            />
            <p className="-mt-2 text-xs text-[var(--color-text-faint)]">
              Pelo menos 6 caracteres.
            </p>

            {error && (
              <p
                role="alert"
                className="rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-2.5 text-sm text-[var(--color-out)]"
              >
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={salvar}
              disabled={saving || !senha || !confirma}
              className="mt-2 min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
            >
              {saving ? "Salvando…" : "Salvar nova senha"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
