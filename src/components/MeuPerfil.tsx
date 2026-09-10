"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { TextField } from "./form/Field";
import { Button, ColorPicker, ErrorNote, Field } from "./ui";

/**
 * Nome de exibição e cor de identidade. A cor é a que pinta a interface
 * inteira no escopo individual — é como a pessoa se reconhece no app.
 *
 * Grava direto em profiles: a política profiles_update_own já permite que
 * cada um edite só a própria linha, então não precisou de nada novo no
 * banco. Reaproveita o ColorPicker de categorias e cartões.
 */
export function MeuPerfil() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { me } = useScope();

  const [nome, setNome] = useState(me.display_name);
  const [cor, setCor] = useState(me.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const mudou = nome.trim() !== me.display_name || cor !== me.color;

  async function salvar() {
    const display_name = nome.trim();
    if (!display_name) {
      setError("O nome não pode ficar vazio.");
      return;
    }

    setSaving(true);
    setError(null);
    setSalvo(false);

    const { error: writeError } = await supabase
      .from("profiles")
      .update({ display_name, color: cor })
      .eq("id", me.id);

    setSaving(false);

    if (writeError) {
      setError("Não deu para salvar. Tente de novo.");
      return;
    }

    setSalvo(true);
    // O layout lê o perfil no servidor: sem isso, o toggle no topo e a cor
    // da interface só mudariam na próxima abertura do app.
    router.refresh();
  }

  return (
    <section className="card flex flex-col gap-4 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Meu perfil</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Como você aparece no app. A cor pinta a interface quando você está
          olhando só o seu.
        </p>
      </div>

      <TextField
        label="Nome"
        value={nome}
        autoComplete="given-name"
        onChange={(event) => {
          setNome(event.target.value);
          setSalvo(false);
        }}
      />

      <Field label="Sua cor">
        <ColorPicker
          value={cor}
          onChange={(nova) => {
            setCor(nova);
            setSalvo(false);
          }}
        />
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}
      {salvo && !mudou && (
        <p className="text-xs text-[var(--color-in)]">Salvo.</p>
      )}

      <div>
        <Button onClick={salvar} disabled={saving || !mudou}>
          {saving ? "Salvando…" : "Salvar perfil"}
        </Button>
      </div>
    </section>
  );
}
