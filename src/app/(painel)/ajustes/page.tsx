import Link from "next/link";
import { MeuPerfil } from "@/components/MeuPerfil";

/* No desktop os ajustes ficam na coluna lateral. No celular a barra de baixo
   é só para o dia a dia, então eles ganham esta página de entrada. */

const LINKS = [
  {
    href: "/contas",
    title: "Contas",
    description:
      "De onde o dinheiro sai. É o que liga um Pix à fatura do cartão.",
  },
  {
    href: "/cartoes",
    title: "Cartões",
    description: "Seus cartões, com fechamento e vencimento. Só você vê.",
  },
  {
    href: "/categorias",
    title: "Categorias",
    description: "Sua lista de categorias e as cores de cada uma.",
  },
];

export default function AjustesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <span className="scope-rule mb-3 block h-1 w-10 rounded-full" />
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          O que você cadastra uma vez e usa em todo lançamento.
        </p>
      </div>

      <MeuPerfil />

      <ul className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="card block px-4 py-4 transition-colors hover:border-[var(--scope)]"
            >
              <p className="font-semibold">{link.title}</p>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">
                {link.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
