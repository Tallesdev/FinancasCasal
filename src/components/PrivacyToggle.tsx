"use client";

import { useEffect, useState } from "react";

/**
 * Esconde todo valor em dinheiro da interface, pra tirar print sem expor
 * a vida financeira de ninguém.
 *
 * Funciona por classe no <html> em vez de contexto: como todo valor do app
 * usa a classe `.money`, uma regra de CSS cobre tela nova sem precisar
 * lembrar de nada. A escolha fica no navegador, não no banco — é
 * preferência de quem está olhando, não do dado.
 */

const KEY = "financas:ocultar-valores";
const CLASS = "hide-money";

export function PrivacyToggle() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY) === "1";
    setHidden(saved);
    document.documentElement.classList.toggle(CLASS, saved);
  }, []);

  function toggle() {
    const next = !hidden;
    setHidden(next);
    document.documentElement.classList.toggle(CLASS, next);
    window.localStorage.setItem(KEY, next ? "1" : "0");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)]"
    >
      {hidden ? <OlhoFechado /> : <Olho />}
      <span className="sr-only sm:not-sr-only">
        {hidden ? "Mostrar" : "Ocultar"}
      </span>
    </button>
  );
}

function Olho() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OlhoFechado() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.2 6.2A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
