"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/form/Field";

/**
 * Login e cadastro na mesma tela. Três modos:
 *   entrar  → e-mail + senha, como sempre foi
 *   criar   → nome + e-mail + senha; ao enviar, cai em "confira"
 *   confira → "mandamos um link para o seu e-mail", com reenvio
 */
type Modo = "entrar" | "criar" | "confira";

/** Mensagens do Supabase vêm em inglês; quem usa lê em português. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "E-mail ou senha não conferem. Tente de novo.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar — veja sua caixa de entrada.";
  if (m.includes("password") && m.includes("at least"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("invalid format") || m.includes("valid email"))
    return "Digite um e-mail válido.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  // Configuração do projeto, não erro da pessoa. Vale dizer com clareza:
  // foi o que escondeu um toggle desligado no painel, no primeiro teste.
  if (m.includes("signups not allowed"))
    return "O cadastro de contas novas está desligado neste momento.";
  return "Não deu certo agora. Tente de novo em instantes.";
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // A rota /auth/confirmar manda pra cá com ?erro= quando o link do e-mail
  // não serve mais. Lido via window em vez de useSearchParams pra não exigir
  // Suspense numa página que é estática.
  useEffect(() => {
    const erro = new URLSearchParams(window.location.search).get("erro");
    if (erro === "confirmacao") {
      setError(
        "Esse link de confirmação não vale mais — pode ter vencido ou já ter sido usado. Peça um novo criando a conta de novo."
      );
      window.history.replaceState(null, "", "/entrar");
    }
  }, []);

  function trocarModo(proximo: Modo) {
    setModo(proximo);
    setError(null);
    setAviso(null);
  }

  async function entrar() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(traduzir(signInError.message));
      return;
    }

    router.replace("/");
    router.refresh();
  }

  async function criar() {
    setError(null);

    if (!nome.trim()) return setError("Diga como quer ser chamado.");
    if (password.length < 6)
      return setError("A senha precisa ter pelo menos 6 caracteres.");

    setLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // O gatilho do banco lê isto pra nomear o perfil.
        data: { display_name: nome.trim() },
        emailRedirectTo: `${window.location.origin}/auth/confirmar`,
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(traduzir(signUpError.message));
      return;
    }

    // Por segurança o Supabase responde "sucesso" mesmo pra e-mail que já
    // tem conta — pra ninguém descobrir quem está cadastrado. Então esta
    // tela é sempre a mesma, independente do que aconteceu de verdade.
    trocarModo("confira");
  }

  async function reenviar() {
    setAviso(null);
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/confirmar` },
    });

    setLoading(false);

    if (resendError) {
      setError(traduzir(resendError.message));
      return;
    }
    setAviso("Mandamos de novo. Vale conferir a caixa de spam também.");
  }

  const enviar = modo === "entrar" ? entrar : criar;
  const podeEnviar =
    !loading &&
    Boolean(email) &&
    Boolean(password) &&
    (modo === "entrar" || Boolean(nome));

  return (
    <main className="scope-us flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span
            className="mb-5 block h-1 w-10 rounded-full bg-[var(--color-couple)]"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">RumoFácil</h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Cada um lança o seu. Os dois veem o todo.
          </p>
        </div>

        {modo === "confira" ? (
          <div className="flex flex-col gap-4">
            <div className="card px-5 py-6">
              <p className="font-semibold">Confira seu e-mail</p>
              <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                Mandamos um link de confirmação para{" "}
                <strong className="text-[var(--color-text)]">
                  {email.trim()}
                </strong>
                . Clique nele para começar.
              </p>
            </div>

            {aviso && (
              <p className="rounded-lg border border-[var(--color-in)]/40 bg-[var(--color-in)]/10 px-3.5 py-2.5 text-sm text-[var(--color-in)]">
                {aviso}
              </p>
            )}
            {error && <Erro>{error}</Erro>}

            <button
              type="button"
              onClick={reenviar}
              disabled={loading}
              className="min-h-11 rounded-lg border border-[var(--color-line)] px-4 text-sm font-medium text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)] disabled:opacity-40"
            >
              {loading ? "Reenviando…" : "Não chegou? Reenviar e-mail"}
            </button>

            <button
              type="button"
              onClick={() => trocarModo("entrar")}
              className="text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
            >
              Já confirmei, quero entrar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              role="group"
              aria-label="Entrar ou criar conta"
              className="inline-flex items-center gap-1 self-start rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1"
            >
              {(
                [
                  { value: "entrar" as Modo, label: "Entrar" },
                  { value: "criar" as Modo, label: "Criar conta" },
                ]
              ).map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  aria-pressed={modo === opcao.value}
                  onClick={() => trocarModo(opcao.value)}
                  className={[
                    "flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                    modo === opcao.value
                      ? "bg-[var(--scope)] text-[var(--color-ink)]"
                      : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                  ].join(" ")}
                >
                  {opcao.label}
                </button>
              ))}
            </div>

            {modo === "criar" && (
              <TextField
                label="Como quer ser chamado"
                autoComplete="given-name"
                value={nome}
                autoFocus
                placeholder="Seu primeiro nome"
                onChange={(event) => setNome(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && enviar()}
              />
            )}

            <TextField
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && enviar()}
            />

            <TextField
              label="Senha"
              type="password"
              autoComplete={
                modo === "criar" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && enviar()}
            />
            {modo === "criar" && (
              <p className="-mt-2 text-xs text-[var(--color-text-faint)]">
                Pelo menos 6 caracteres.
              </p>
            )}

            {error && <Erro>{error}</Erro>}

            <button
              type="button"
              onClick={enviar}
              disabled={!podeEnviar}
              className="mt-2 min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
            >
              {loading
                ? modo === "criar"
                  ? "Criando…"
                  : "Entrando…"
                : modo === "criar"
                  ? "Criar conta"
                  : "Entrar"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-2.5 text-sm text-[var(--color-out)]"
    >
      {children}
    </p>
  );
}
