"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
 * Dá pra dar no cadastro (caixa opcional), aqui, ou na hora do primeiro
 * recibo. Retirar apaga os recibos guardados (FASE_E.md §3.6): retirar é
 * pedir pra parar de tratar, e guardar é tratar. Por isso a retirada passa
 * pelo servidor, que apaga os arquivos no R2 antes de zerar a coluna.
 */
export function ConsentimentoRecibos() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { me, recursos } = useScope();

  const [valor, setValor] = useState<string | null>(me.receipts_consent_at ?? null);
  const [guardados, setGuardados] = useState(0);
  const [confirmando, setConfirmando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O perfil pode mudar por fora (ex: consentimento dado ao anexar um recibo).
  useEffect(() => {
    setValor(me.receipts_consent_at ?? null);
  }, [me.receipts_consent_at]);

  useEffect(() => {
    // Antes da migração 009 a tabela não existe: a contagem só fica zero.
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", me.id)
      .then(({ count }) => setGuardados(count ?? 0));
  }, [supabase, me.id, valor]);

  async function permitir() {
    setSalvando(true);
    setError(null);
    const novo = new Date().toISOString();
    const { error: e } = await supabase
      .from("profiles")
      .update({ receipts_consent_at: novo })
      .eq("id", me.id);
    setSalvando(false);
    if (e) return setError("Não deu para salvar. Tente de novo.");
    setValor(novo);
    router.refresh();
  }

  async function retirar() {
    setSalvando(true);
    setError(null);
    try {
      const r = await fetch("/api/recibos/retirar-consentimento", { method: "POST" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Não deu para salvar. Tente de novo.");
      }
      setValor(null);
      setConfirmando(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não deu para salvar. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card flex flex-col gap-4 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Recibos</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Guardar fotos de recibos — por exemplo pra declaração de imposto de renda.
          {recursos.recibos ? (
            <>
              {" "}
              <Link href="/recibos" className="underline hover:text-[var(--color-text)]">
                Ver meus recibos
              </Link>
              .
            </>
          ) : (
            " Recurso ainda não ligado neste app."
          )}
        </p>
      </div>

      <p className="text-sm text-[var(--color-text-dim)]">
        Um recibo pode conter dado de saúde, como o de uma farmácia. Por isso guardar recibos
        depende do seu consentimento, que é opcional e pode ser retirado quando quiser.
      </p>

      {error && <ErrorNote>{error}</ErrorNote>}

      {!valor ? (
        <div>
          <Button variant="ghost" onClick={permitir} disabled={salvando}>
            {salvando ? "Salvando…" : "Permitir guardar recibos"}
          </Button>
        </div>
      ) : confirmando ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-3 text-sm">
          <p>
            {guardados > 0 ? (
              <>
                Retirar o consentimento <strong>apaga {guardados === 1 ? "o recibo guardado" : `os ${guardados} recibos guardados`}</strong>,
                na hora e sem volta. Os gastos continuam; só as fotos somem. Se precisar delas,
                baixe antes em Recibos.
              </>
            ) : (
              <>Você não tem recibos guardados. Retirar só desliga a permissão.</>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={retirar} disabled={salvando}>
              {salvando ? "Apagando…" : guardados > 0 ? "Apagar e retirar" : "Retirar"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-in)]">Você permitiu em {formatDate(valor)}.</p>
          <Button variant="ghost" onClick={() => setConfirmando(true)}>
            Retirar consentimento
          </Button>
        </div>
      )}
    </section>
  );
}
