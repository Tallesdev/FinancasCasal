"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { TextField } from "./form/Field";
import { Button, DeleteButton, Dot, ErrorNote } from "./ui";
import { formatDate } from "@/lib/format";
import type { Household, HouseholdInvite } from "@/lib/types";

const LIMITE = 6;

/**
 * A casa: nome, quem está nela, convidar por link, sair.
 *
 * O limite de 6 e as regras de aceite vivem no banco (create_invite,
 * accept_invite, leave_household). Aqui só se repete o aviso pra pessoa
 * entender — quem garante é o banco.
 */
export function MinhaCasa() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { me, members } = useScope();

  const [casa, setCasa] = useState<Household | null>(null);
  const [nome, setNome] = useState("");
  const [convites, setConvites] = useState<HouseholdInvite[]>([]);
  const [emailConvite, setEmailConvite] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // A RLS devolve só a minha casa e só os convites dela.
    const [casaResult, convitesResult] = await Promise.all([
      supabase.from("households").select("id, name").limit(1).maybeSingle(),
      supabase
        .from("household_invites")
        .select("*")
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);

    const c = (casaResult.data as Household | null) ?? null;
    setCasa(c);
    setNome(c?.name ?? "");
    // Tabela ausente = migração 005 não rodou. Não é motivo pra quebrar
    // a tela de ajustes inteira; a seção só fica sem convites.
    setConvites((convitesResult.data ?? []) as HouseholdInvite[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const vagas = LIMITE - members.length - convites.length;

  async function renomear() {
    const name = nome.trim();
    if (!casa || !name || name === casa.name) return;
    setSaving(true);
    setError(null);
    const { error: e } = await supabase
      .from("households")
      .update({ name })
      .eq("id", casa.id);
    setSaving(false);
    if (e) return setError("Não deu para renomear. Tente de novo.");
    setCasa({ ...casa, name });
  }

  async function convidar() {
    setSaving(true);
    setError(null);
    setLink(null);
    setCopiado(false);

    const { data, error: e } = await supabase.rpc("create_invite", {
      p_email: emailConvite.trim() || null,
    });

    setSaving(false);

    // As mensagens de erro do banco já vêm em português.
    if (e) return setError(e.message);

    setLink(`${window.location.origin}/convite/${data as string}`);
    setEmailConvite("");
    load();
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setError("Não deu para copiar. Selecione o link e copie na mão.");
    }
  }

  async function compartilhar() {
    if (!link) return;
    // A folha nativa do celular — WhatsApp aparece ali.
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Convite para ${casa?.name ?? "minha casa"}`,
          text: `${me.display_name.split(" ")[0]} te convidou para juntar as finanças no RumoFácil.`,
          url: link,
        });
      } catch {
        // Cancelou a folha: nada a fazer.
      }
    } else {
      copiar();
    }
  }

  async function revogar(id: string) {
    setError(null);
    const { error: e } = await supabase
      .from("household_invites")
      .update({ status: "revoked" })
      .eq("id", id);
    if (e) return setError("Não deu para revogar. Tente de novo.");
    if (link) setLink(null);
    load();
  }

  async function sair() {
    setSaving(true);
    setError(null);
    const { error: e } = await supabase.rpc("leave_household");
    setSaving(false);
    if (e) return setError(e.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-5 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Minha casa</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Quem divide as finanças com você. Até {LIMITE} pessoas.
        </p>
      </div>

      {casa && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label="Nome da casa"
              value={nome}
              placeholder="Família Silva, Nossa casa…"
              onChange={(event) => setNome(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && renomear()}
            />
          </div>
          <Button
            variant="ghost"
            onClick={renomear}
            disabled={saving || !nome.trim() || nome.trim() === casa.name}
          >
            Renomear
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
          Quem está aqui
        </p>
        <ul className="flex flex-col gap-1.5">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-2.5 text-sm">
              <Dot color={m.color} />
              <span>{m.display_name}</span>
              {m.id === me.id && (
                <span className="text-xs text-[var(--color-text-faint)]">
                  você
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-text-faint)]">
          Convidar alguém
        </p>

        {vagas <= 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">
            A casa está no limite de {LIMITE} pessoas, contando convites
            pendentes. Revogue um convite para abrir vaga.
          </p>
        ) : (
          <>
            <TextField
              label="Só este e-mail pode aceitar"
              type="email"
              inputMode="email"
              value={emailConvite}
              placeholder="Opcional — deixe vazio para qualquer um com o link"
              onChange={(event) => setEmailConvite(event.target.value)}
            />
            <div>
              <Button onClick={convidar} disabled={saving}>
                {saving ? "Gerando…" : "Gerar link de convite"}
              </Button>
            </div>
          </>
        )}

        {link && (
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--scope)]/30 bg-[var(--scope)]/10 px-3.5 py-3">
            <p className="text-xs text-[var(--color-text-faint)]">
              Mande este link pra pessoa. Vale por 7 dias.
            </p>
            <code className="break-all font-mono text-xs">{link}</code>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={copiar} className="px-3 py-1.5 text-xs">
                {copiado ? "Copiado" : "Copiar"}
              </Button>
              <Button variant="ghost" onClick={compartilhar} className="px-3 py-1.5 text-xs">
                Compartilhar
              </Button>
            </div>
          </div>
        )}

        {convites.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {convites.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 text-[var(--color-text-dim)]">
                  <span className="truncate">
                    {c.invited_email ?? "Qualquer um com o link"}
                  </span>
                  <span className="ml-2 text-xs text-[var(--color-text-faint)]">
                    até {formatDate(c.expires_at)}
                  </span>
                </span>
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-xs"
                  onClick={() => revogar(c.id)}
                >
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Sair de uma casa solo não significa nada. */}
      {members.length > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-line)] pt-4">
          <p className="text-xs text-[var(--color-text-faint)]">
            Seus lançamentos vão com você. Você vai para uma casa nova, sozinho.
          </p>
          <DeleteButton onConfirm={sair} label="Sair da casa" />
        </div>
      )}
    </section>
  );
}
