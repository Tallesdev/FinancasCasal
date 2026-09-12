"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/form/Field";

/**
 * "Tenho um código". Quem recebeu o código de 8 caracteres por telefone ou
 * de boca digita aqui e cai na mesma página do convite por link —
 * get_invite e accept_invite aceitam os dois no mesmo parâmetro.
 */
export default function ConviteCodigoPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");

  // Sem 0/O nem 1/I/L no alfabeto: aceita o que a pessoa digitou, mas
  // limpa espaço, hífen e caixa antes de mandar.
  const limpo = codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");

  function ir() {
    if (limpo.length !== 8) return;
    router.push(`/convite/${limpo}`);
  }

  return (
    <main className="scope-us flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span
            className="mb-5 block h-1 w-10 rounded-full bg-[var(--color-couple)]"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">Entrar numa casa</h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Digite o código que alguém da casa te passou.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <TextField
            label="Código do convite"
            value={codigo}
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            className="font-mono tracking-widest"
            onChange={(event) => setCodigo(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && ir()}
          />
          <button
            type="button"
            onClick={ir}
            disabled={limpo.length !== 8}
            className="min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
          >
            Ver o convite
          </button>
        </div>
      </div>
    </main>
  );
}
