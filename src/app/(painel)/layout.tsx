import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScopeProvider } from "@/components/ScopeProvider";
import { ScopeToggle } from "@/components/ScopeToggle";
import { Nav } from "@/components/Nav";
import { SignOutButton } from "@/components/SignOutButton";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import type { Household, Profile } from "@/lib/types";

export default async function PainelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // Conferido localmente pela assinatura (ver lib/supabase/middleware.ts).
  // Mesmo que um token forjado passasse daqui, as consultas abaixo levam o
  // token ao banco, e a RLS confere de novo.
  const { data: auth } = await supabase.auth.getClaims();
  const user = auth?.claims ? { id: auth.claims.sub } : null;

  if (!user) redirect("/entrar");

  // A RLS já limita esta consulta à casa de quem está logado.
  // `select("*")` de propósito: se uma migração ainda não rodou, a coluna
  // nova só vem indefinida em vez de derrubar o app inteiro.
  const [{ data: profiles }, { data: casa }] = await Promise.all([
    supabase.from("profiles").select("*"),
    // A RLS devolve só a casa de quem está logado.
    supabase.from("households").select("id, name, color").maybeSingle(),
  ]);

  const me = (profiles ?? []).find((p) => p.id === user.id) as Profile | undefined;

  if (!me) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          {/* Com o gatilho de cadastro, o perfil nasce junto com a conta.
              Chegar aqui significa que ele falhou — é rede de segurança,
              não fluxo normal. */}
          <h1 className="text-xl font-bold">Seu perfil não foi criado</h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Algo deu errado ao criar sua conta. Saia e entre de novo; se
            continuar, fale com quem cuida do app.
          </p>
        </div>
      </main>
    );
  }

  // A RLS devolve todo mundo da casa — até 6 pessoas, eu incluso.
  const members = (profiles ?? []) as Profile[];

  return (
    <ScopeProvider
      me={me}
      members={members}
      household={(casa as Household | null) ?? null}
    >
      <RegisterServiceWorker />
      <div className="flex min-h-dvh">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-ink)]/90 px-3 py-3 backdrop-blur sm:gap-3 sm:px-5">
            <ScopeToggle />
            <div className="flex items-center gap-2 sm:gap-4">
              <PrivacyToggle />
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
