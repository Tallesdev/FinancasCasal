"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useScope } from "./ScopeProvider";
import { TERMOS_VERSAO } from "@/lib/legal";

/**
 * Avisa quando os termos mudaram desde o último aceite, e registra o novo.
 *
 * O aceite do cadastro (obrigatório, em /entrar) cobre quem entra agora.
 * Isto cobre os dois casos que ele não cobre: quem criou a conta antes de
 * existirem termos, e quem aceitou uma versão anterior.
 *
 * Avisa, não bloqueia: o app continua utilizável. Travar a tela seria
 * transformar em barreira algo que é informação — e o único uso do registro
 * é saber qual versão cada pessoa viu.
 */
export function AceiteTermos() {
  const router = useRouter();
  const { me } = useScope();

  const [dispensado, setDispensado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const precisa = me.terms_version !== TERMOS_VERSAO;
  if (!precisa || dispensado) return null;

  const primeiraVez = !me.terms_version;

  async function aceitar() {
    setSalvando(true);
    setError(null);
    try {
      const r = await fetch("/api/termos/aceitar", { method: "POST" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Não deu para registrar o aceite.");
      }
      setDispensado(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para registrar o aceite.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p className="min-w-48 flex-1 text-sm text-[var(--color-text-dim)]">
          {primeiraVez
            ? "Sua conta é anterior aos nossos termos de uso."
            : "Os termos de uso e a política de privacidade mudaram."}{" "}
          <Link href="/termos" target="_blank" className="underline hover:text-[var(--color-text)]">
            Ler os termos
          </Link>{" "}
          e a{" "}
          <Link
            href="/privacidade"
            target="_blank"
            className="underline hover:text-[var(--color-text)]"
          >
            política de privacidade
          </Link>
          .{error && <span className="ml-1 text-[var(--color-out)]">{error}</span>}
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={aceitar}
            disabled={salvando}
            className="min-h-11 rounded-lg bg-[var(--scope)] px-4 text-sm font-semibold text-[var(--color-ink)] disabled:opacity-40"
          >
            {salvando ? "Salvando…" : "Li e aceito"}
          </button>
          <button
            type="button"
            onClick={() => setDispensado(true)}
            className="min-h-11 rounded-lg px-3 text-sm text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
          >
            Depois
          </button>
        </div>
      </div>
    </div>
  );
}
