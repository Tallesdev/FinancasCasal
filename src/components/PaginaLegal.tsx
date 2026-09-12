import Link from "next/link";
import { CONTATO_EMAIL, TERMOS_VERSAO } from "@/lib/legal";
import { formatDate } from "@/lib/format";

/**
 * Casca comum de /privacidade e /termos: mesma largura de leitura, mesma
 * data de versão, mesmo caminho de volta. Fora do painel de propósito —
 * quem ainda não tem conta precisa conseguir ler antes de aceitar.
 */
export function PaginaLegal({
  titulo,
  resumo,
  children,
}: {
  titulo: string;
  resumo: string;
  children: React.ReactNode;
}) {
  return (
    <main className="scope-us min-h-dvh px-6 py-12">
      <article className="mx-auto w-full max-w-2xl">
        <Link
          href="/entrar"
          className="text-sm text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
        >
          &larr; RumoFácil
        </Link>

        <span
          className="mb-4 mt-8 block h-1 w-10 rounded-full bg-[var(--color-couple)]"
          aria-hidden="true"
        />
        <h1 className="text-3xl font-bold">{titulo}</h1>
        <p className="mt-2 text-sm text-[var(--color-text-faint)]">
          Versão de {formatDate(TERMOS_VERSAO)}
        </p>
        <p className="mt-6 text-[var(--color-text-dim)]">{resumo}</p>

        <div className="legal mt-10 flex flex-col gap-8">{children}</div>

        <nav className="mt-14 flex flex-wrap gap-4 border-t border-[var(--color-line)] pt-6 text-sm text-[var(--color-text-faint)]">
          <Link href="/termos" className="underline hover:text-[var(--color-text)]">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="underline hover:text-[var(--color-text)]">
            Política de privacidade
          </Link>
        </nav>
      </article>
    </main>
  );
}

export function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{titulo}</h2>
      <div className="flex flex-col gap-3 text-sm leading-relaxed text-[var(--color-text-dim)]">
        {children}
      </div>
    </section>
  );
}

/** O contato, ou um aviso honesto de que ainda não foi definido. */
export function Contato() {
  return CONTATO_EMAIL ? (
    <a
      href={`mailto:${CONTATO_EMAIL}`}
      className="font-medium text-[var(--color-text)] underline"
    >
      {CONTATO_EMAIL}
    </a>
  ) : (
    <span className="font-medium text-[var(--color-out)]">
      (e-mail de contato ainda não definido)
    </span>
  );
}
