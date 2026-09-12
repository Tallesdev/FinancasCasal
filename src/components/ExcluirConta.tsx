"use client";

import { useState } from "react";
import { useScope } from "./ScopeProvider";
import { PasswordField, TextField } from "./form/Field";
import { Button, ErrorNote } from "./ui";

const PALAVRA = "EXCLUIR";

/**
 * Excluir a conta. Irreversível, então fica escondido atrás de um botão, e
 * diz com todas as letras o que some — inclusive o que some para os outros
 * da casa, que é a parte que a pessoa costuma não prever.
 *
 * As travas de verdade (sessão, senha, palavra) estão no servidor. Aqui só
 * se repete, pra pessoa não chegar lá sem entender.
 */
export function ExcluirConta() {
  const { members } = useScope();
  const divideCasa = members.length > 1;

  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState("");
  const [palavra, setPalavra] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pronto = Boolean(senha) && palavra.trim().toUpperCase() === PALAVRA;

  async function excluir() {
    if (!pronto) return;
    setExcluindo(true);
    setError(null);

    try {
      const r = await fetch("/api/conta/excluir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha, confirmacao: PALAVRA }),
      });
      const json = (await r.json()) as { ok?: true; error?: string };

      if (!r.ok || !json.ok) {
        setError(json.error ?? "Não deu para excluir a conta agora.");
        setExcluindo(false);
        return;
      }

      // Navegação completa, não router: descarta qualquer estado da sessão
      // que já não existe.
      window.location.replace("/entrar?conta=excluida");
    } catch {
      setError("Sem conexão. Nada foi apagado; tente de novo.");
      setExcluindo(false);
    }
  }

  return (
    <section className="card flex flex-col gap-4 border-[var(--color-out)]/30 px-4 py-5">
      <div>
        <h2 className="text-sm font-semibold">Excluir conta</h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
          Apaga sua conta e tudo o que é seu, na hora. Não tem volta.
        </p>
      </div>

      {!aberto ? (
        <div>
          <Button variant="danger" onClick={() => setAberto(true)}>
            Quero excluir minha conta
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-3 text-sm">
            <p className="font-medium text-[var(--color-text)]">O que é apagado:</p>
            <ul className="mt-2 ml-5 list-disc space-y-1 text-[var(--color-text-dim)]">
              <li>seu perfil e seu login;</li>
              <li>todos os seus gastos, rendas e investimentos;</li>
              <li>seus cartões, categorias, contas bancárias e recibos;</li>
              <li>os convites que você criou.</li>
            </ul>
            {divideCasa && (
              <p className="mt-3 text-[var(--color-text-dim)]">
                <strong className="text-[var(--color-text)]">Sua casa continua</strong>{" "}
                para as outras pessoas, mas seus lançamentos somem da visão de
                todos também.
              </p>
            )}
          </div>

          <PasswordField
            label="Sua senha"
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
          />

          <TextField
            label={`Digite ${PALAVRA} para confirmar`}
            value={palavra}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setPalavra(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && excluir()}
          />

          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              onClick={excluir}
              disabled={!pronto || excluindo}
            >
              {excluindo ? "Excluindo…" : "Excluir minha conta para sempre"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAberto(false);
                setSenha("");
                setPalavra("");
                setError(null);
              }}
              disabled={excluindo}
            >
              Cancelar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
