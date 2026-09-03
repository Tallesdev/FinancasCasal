"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField } from "@/components/form/Field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "E-mail ou senha não conferem. Tente de novo."
          : "Não deu para entrar agora. Tente de novo em instantes."
      );
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="scope-us flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="mb-5 flex items-center gap-1.5" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-[var(--color-person-a)]" />
            <span className="h-1 w-10 rounded-full bg-[var(--color-person-b)]" />
          </div>
          <h1 className="text-3xl font-bold">Finanças do casal</h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Cada um lança o seu. Os dois veem o todo.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <TextField
            label="E-mail"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
          />

          <TextField
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSubmit()}
          />

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
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="mt-2 min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
          >
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </div>
      </div>
    </main>
  );
}
