"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { Button, ErrorNote } from "./ui";
import { formatDate } from "@/lib/format";

/**
 * Consentimento para guardar recibos. Separado do aceite dos termos porque
 * recibo pode conter dado de saúde (farmácia, clínica), que a LGPD trata
 * como sensível e exige consentimento específico e livre — não pode vir
 * embutido no aceite geral nem ser condição pra usar o app.
 *
 * Dá pra dar no cadastro (caixa opcional) ou aqui, e retirar a qualquer
 * momento. A escrita passa pelo grant de coluna da migração 008: esta é uma
 * das poucas colunas do perfil que a própria pessoa pode alterar.
 */
export function ConsentimentoRecibos() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { me } = useScope();

  const [valor, setValor] = useState<string | null>(me.receipts_consent_at ?? null);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function definir(consentir: boolean) {
    setSalvando(true);
    setError(null);
    const novo = consentir ? new Date().toISOString() : null;
    const { error: e } = await supabase
      .from("profiles")
      .update({ receipts_consent_at: novo })
      .eq("id", me.id);
    setSalvando(false);
    if (e) return setError("Não deu para salvar. Tente de novo.");
    setValor(novo);
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-4 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Recibos</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Guardar fotos de recibos — por exemplo pra declaração de imposto de renda. Recurso em
          preparação.
        </p>
      </div>

      <p className="text-sm text-[var(--color-text-dim)]">
        Um recibo pode conter dado de saúde, como o de uma farmácia. Por isso guardar recibos
        depende do seu consentimento, que é opcional e pode ser retirado quando quiser.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {valor ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-in)]">
            Você permitiu em {formatDate(valor)}.
          </p>
          <Button variant="ghost" onClick={() => definir(false)} disabled={salvando}>
            {salvando ? "Salvando…" : "Retirar consentimento"}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="ghost" onClick={() => definir(true)} disabled={salvando}>
            {salvando ? "Salvando…" : "Permitir guardar recibos"}
          </Button>
        </div>
      )}
    </section>
  );
}
