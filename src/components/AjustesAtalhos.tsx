"use client";

import Link from "next/link";
import { useScope } from "./ScopeProvider";

/* No desktop os ajustes ficam na coluna lateral. No celular a barra de baixo
   é só para o dia a dia, então eles ganham estes atalhos. */

const LINKS = [
  {
    href: "/contas",
    title: "Contas",
    description: "De onde o dinheiro sai. É o que liga um Pix à fatura do cartão.",
    empresa: "De onde o dinheiro da empresa sai. Os sócios também veem.",
  },
  {
    href: "/cartoes",
    title: "Cartões",
    description: "Seus cartões, com fechamento e vencimento. Só você vê.",
    empresa: "Os cartões da empresa. Os sócios também veem.",
  },
  {
    href: "/categorias",
    title: "Categorias",
    description: "Sua lista de categorias e as cores de cada uma.",
  },
  {
    href: "/recibos",
    title: "Recibos",
    description: "Fotos dos comprovantes por ano, pra hora do imposto. Só você vê.",
    empresa: "Fotos de recibos e notas por ano, pra quando o contador pedir. Só você vê.",
  },
  {
    href: "/importar",
    title: "Importar planilha",
    description: "Traga lançamentos de um CSV do Excel ou do Google Planilhas.",
  },
];

export function AjustesAtalhos() {
  const { empresa } = useScope();

  return (
    <ul className="grid gap-3 sm:grid-cols-2 md:hidden">
      {LINKS.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="card block px-4 py-4 transition-colors hover:border-[var(--scope)]"
          >
            <p className="font-semibold">{link.title}</p>
            <p className="mt-1 text-sm text-[var(--color-text-dim)]">
              {(empresa && link.empresa) || link.description}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
