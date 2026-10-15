"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useScope } from "./ScopeProvider";

/**
 * O botão ⚙ Ajustes do topo (celular). Tocar abre uma lista com os atalhos
 * mais usados; o resto fica em "Configurações" (a tela /ajustes inteira).
 * Fecha ao escolher, ao tocar fora, no Esc e ao trocar de tela.
 */
export function MenuAjustes() {
  const { empresa } = useScope();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Trocou de tela (inclusive pelo voltar do celular): fecha.
  useEffect(() => setAberto(false), [pathname]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (event: PointerEvent) => {
      if (caixa.current && !caixa.current.contains(event.target as Node)) setAberto(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const atalhos = [
    { href: "/contas", label: "Contas" },
    { href: "/cartoes", label: "Cartões" },
    { href: "/categorias", label: "Categorias" },
    { href: "/recibos", label: "Recibos" },
    ...(empresa ? [{ href: "/acerto", label: "Acerto entre sócios" }] : []),
  ];

  return (
    <div ref={caixa} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        className={[
          "flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] transition-colors hover:text-[var(--color-text)]",
          aberto ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)]",
        ].join(" ")}
      >
        <Engrenagem />
        Ajustes
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] py-1 shadow-xl shadow-black/40"
        >
          {atalhos.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className={[
                "flex min-h-11 items-center px-4 text-sm transition-colors hover:bg-[var(--color-surface-2)]",
                pathname.startsWith(item.href) ? "text-[var(--scope)]" : "text-[var(--color-text)]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          ))}
          <div className="my-1 border-t border-[var(--color-line)]" />
          <Link
            href="/ajustes"
            role="menuitem"
            className="flex min-h-11 items-center gap-2 px-4 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <Engrenagem pequena />
            Configurações
          </Link>
        </div>
      )}
    </div>
  );
}

function Engrenagem({ pequena }: { pequena?: boolean }) {
  const tamanho = pequena ? 16 : 20;
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
