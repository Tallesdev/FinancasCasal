"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Início" },
  { href: "/gastos", label: "Gastos" },
  { href: "/renda", label: "Renda" },
  { href: "/investimentos", label: "Investir" },
  { href: "/relatorios", label: "Relatórios" },
];

const SETTINGS = [
  { href: "/contas", label: "Contas" },
  { href: "/cartoes", label: "Cartões" },
  { href: "/categorias", label: "Categorias" },
  // Sem isto, perfil, casa e convites ficam inalcançáveis no desktop: o
  // atalho de /ajustes no header é md:hidden.
  { href: "/ajustes", label: "Perfil e casa" },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Celular: barra fixa embaixo, ao alcance do polegar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-line)] bg-[var(--color-surface)]/95 backdrop-blur md:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
          {LINKS.map((link) => (
            <li key={link.href} className="flex-1">
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={[
                  "flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                  isActive(link.href)
                    ? "text-[var(--scope)]"
                    : "text-[var(--color-text-faint)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "h-0.5 w-6 rounded-full transition-colors",
                    isActive(link.href) ? "scope-rule" : "bg-transparent",
                  ].join(" ")}
                />
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Desktop: coluna lateral */}
      <nav className="hidden w-56 shrink-0 flex-col gap-8 border-r border-[var(--color-line)] px-5 py-8 md:flex">
        <ul className="flex flex-col gap-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={[
                  "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-[var(--color-surface-2)] text-[var(--scope)]"
                    : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
                ].join(" ")}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
            Ajustes
          </p>
          {SETTINGS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? "page" : undefined}
              className={[
                "block rounded-lg px-3 py-2 text-sm transition-colors",
                isActive(link.href)
                  ? "bg-[var(--color-surface-2)] text-[var(--scope)]"
                  : "text-[var(--color-text-dim)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
              ].join(" ")}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
