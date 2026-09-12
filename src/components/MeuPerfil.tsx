"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { PasswordField, TextField } from "./form/Field";
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

  // Trocar senha mora aqui porque o fluxo de "esqueci" vive fora do app —
  // quem já está logado não tinha nenhum caminho pra trocar.
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [senhaSalva, setSenhaSalva] = useState(false);
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

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

  async function trocarSenha() {
    setSenhaErro(null);
    setSenhaSalva(false);

    if (senha.length < 6)
      return setSenhaErro("A senha precisa ter pelo menos 6 caracteres.");
    if (senha !== confirma) return setSenhaErro("As duas senhas não batem.");

    setSalvandoSenha(true);
    const { error: e } = await supabase.auth.updateUser({ password: senha });
    setSalvandoSenha(false);

    if (e) {
      const m = e.message.toLowerCase();
      setSenhaErro(
        m.includes("different from the old")
          ? "A senha nova precisa ser diferente da antiga."
          : "Não deu para trocar a senha. Tente de novo."
      );
      return;
    }

    setSenha("");
    setConfirma("");
    setSenhaSalva(true);
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

      <div className="flex flex-col gap-4 border-t border-[var(--color-line)] pt-4">
        <div>
          <h3 className="text-sm font-semibold">Trocar senha</h3>
          <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
            Sem precisar sair do app nem pedir link por e-mail.
          </p>
        </div>

        <PasswordField
          label="Nova senha"
          autoComplete="new-password"
          value={senha}
          onChange={(event) => {
            setSenha(event.target.value);
            setSenhaSalva(false);
          }}
        />
        <PasswordField
          label="Repita a nova senha"
          autoComplete="new-password"
          value={confirma}
          onChange={(event) => {
            setConfirma(event.target.value);
            setSenhaSalva(false);
          }}
          onKeyDown={(event) => event.key === "Enter" && trocarSenha()}
        />

        {senhaErro && <ErrorNote>{senhaErro}</ErrorNote>}
        {senhaSalva && (
          <p className="text-xs text-[var(--color-in)]">Senha trocada.</p>
        )}

        <div>
          <Button
            variant="ghost"
            onClick={trocarSenha}
            disabled={salvandoSenha || !senha || !confirma}
          >
            {salvandoSenha ? "Trocando…" : "Trocar senha"}
          </Button>
        </div>
      </div>
    </section>
  );
}
