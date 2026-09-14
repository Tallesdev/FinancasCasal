"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Aviso de cookies — de informação, não de consentimento.
 *
 * O app só usa o que é **estritamente necessário** pra funcionar: o cookie
 * de sessão do Supabase (sem ele não dá pra ficar logado) e duas
 * preferências de tela no localStorage. Não há rastreador, publicidade nem
 * medição de audiência.
 *
 * Por isso não existe "aceitar cookies" aqui: a LGPD e a orientação da ANPD
 * dispensam consentimento para cookie necessário — pedir permissão pra algo
 * que a pessoa não pode recusar (e continuar usando) seria consentimento de
 * mentira. O que a lei pede é **transparência**, e é o que esta barra faz:
 * aparece uma vez, some quando a pessoa fecha, e o detalhe fica na
 * política.
 *
 * Como não há escolha a registrar, a dispensa mora no aparelho (uma chave
 * no localStorage) e não vira dado guardado sobre ninguém. Some se a pessoa
 * limpar o navegador — e aí aparece de novo, o que é o comportamento certo.
 */
const CHAVE = "financas:aviso-cookies";

export function AvisoCookies() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAVE) !== "1") setVisivel(true);
    } catch {
      // Navegador com armazenamento bloqueado: não mostra e não insiste.
    }
  }, []);

  if (!visivel) return null;

  function fechar() {
    try {
      window.localStorage.setItem(CHAVE, "1");
    } catch {
      // Sem poder guardar a dispensa, ao menos some nesta sessão.
    }
    setVisivel(false);
  }

  return (
    <div
      role="note"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <p className="min-w-48 flex-1 text-xs leading-relaxed text-[var(--color-text-dim)]">
          Este app usa só o necessário para funcionar: um cookie para manter você
          conectado e duas preferências de tela guardadas no seu aparelho. Sem
          rastreadores e sem publicidade.{" "}
          <Link href="/privacidade" className="underline hover:text-[var(--color-text)]">
            Saiba mais
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={fechar}
          className="min-h-11 shrink-0 rounded-lg border border-[var(--color-line)] px-4 text-sm font-semibold text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
