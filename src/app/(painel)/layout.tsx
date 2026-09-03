import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopeProvider } from "@/components/ScopeProvider";
import { ScopeToggle } from "@/components/ScopeToggle";
import { Nav } from "@/components/Nav";
import { SignOutButton } from "@/components/SignOutButton";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import type { Profile } from "@/lib/types";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/entrar");

  // A RLS já limita esta consulta à casa de quem está logado.
  // `select("*")` de propósito: se uma migração ainda não rodou, a coluna
  // nova só vem indefinida em vez de derrubar o app inteiro.
  const { data: profiles } = await supabase.from("profiles").select("*");

  const me = (profiles ?? []).find((p) => p.id === user.id) as Profile | undefined;

  if (!me) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-bold">Falta vincular seu perfil</h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Rode o <code className="font-mono">supabase/seed.sql</code> para criar
            a casa e ligar as duas contas a ela.
          </p>
        </div>
      </main>
    );
  }

  const partner =
    ((profiles ?? []).find((p) => p.id !== user.id) as Profile | undefined) ?? null;

  return (
    <ScopeProvider me={me} partner={partner}>
      <RegisterServiceWorker />
      <div className="flex min-h-dvh">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-ink)]/90 px-5 py-3 backdrop-blur">
            <ScopeToggle />
            <div className="flex items-center gap-4">
              {/* No celular a barra de baixo não cabe os ajustes. */}
              <Link
                href="/ajustes"
                className="text-sm text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)] md:hidden"
              >
                Ajustes
              </Link>
              <SignOutButton />
            </div>
          </header>

          <main className="flex-1 px-5 pb-28 pt-6 md:pb-10">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
    </ScopeProvider>
  );
}
