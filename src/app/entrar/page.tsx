"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DateField, PasswordField, TextField } from "@/components/form/Field";
import { IDADE_MINIMA, TERMOS_VERSAO, idadeEm } from "@/lib/legal";
import { toISODate } from "@/lib/format";

/**
 * O cliente do Supabase é a maior parte do JavaScript desta tela, e ela só
 * precisa dele no toque do botão. Importado sob demanda, o formulário fica
 * pronto pra digitar antes; o download começa logo depois de a tela
 * aparecer (useEffect abaixo), então no clique ele quase sempre já chegou.
 */
const carregarCliente = () =>
  import("@/lib/supabase/client").then((modulo) => modulo.createClient());

/**
 * Login e cadastro na mesma tela. Três modos:
 *   entrar  → e-mail + senha, como sempre foi
 *   criar   → nome + e-mail + senha; ao enviar, cai em "confira"
 *   confira → "mandamos um link para o seu e-mail", com reenvio
 */
type Modo = "entrar" | "criar" | "esqueci" | "confira";
/** A tela "confira seu e-mail" serve pra cadastro e pra senha. */
type Motivo = "cadastro" | "senha";

/** Mensagens do Supabase vêm em inglês; quem usa lê em português. */
function traduzir(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials"))
    return "E-mail ou senha não conferem. Tente de novo.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar — veja sua caixa de entrada.";
  if (m.includes("password") && m.includes("at least"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("invalid format") || m.includes("valid email"))
    return "Digite um e-mail válido.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  // Configuração do projeto, não erro da pessoa. Vale dizer com clareza:
  // foi o que escondeu um toggle desligado no painel, no primeiro teste.
  if (m.includes("signups not allowed"))
    return "O cadastro de contas novas está desligado neste momento.";
  return "Não deu certo agora. Tente de novo em instantes.";
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("entrar");
  const [motivo, setMotivo] = useState<Motivo>("cadastro");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Pra onde ir depois de entrar. Vem de um convite: /entrar?next=/convite/x
  const [next, setNext] = useState<string | null>(null);
  // Só usada pra conferir a idade AQUI. Nunca é enviada nem guardada: o
  // banco recebe apenas "declarou ser maior". Minimização, LGPD art. 6º.
  const [nascimento, setNascimento] = useState("");
  const [aceite, setAceite] = useState(false);
  const [consenteRecibos, setConsenteRecibos] = useState(false);
  /** Mensagem neutra (nem erro nem sucesso), ex: depois de excluir a conta. */
  const [info, setInfo] = useState<string | null>(null);

  // Adianta o download do cliente (ver carregarCliente).
  useEffect(() => {
    import("@/lib/supabase/client");
  }, []);

  // A rota /auth/confirmar manda pra cá com ?erro= quando o link do e-mail
  // não serve mais. Lido via window em vez de useSearchParams pra não exigir
  // Suspense numa página que é estática.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const destino = params.get("next");
    // Só caminho relativo dentro do app — nunca URL externa (open redirect).
    if (destino && destino.startsWith("/") && !destino.startsWith("//"))
      setNext(destino);
    if (params.get("conta") === "excluida") {
      setInfo("Sua conta foi excluída, com tudo o que era seu.");
      window.history.replaceState(null, "", "/entrar");
    }
    const erro = params.get("erro");
    if (erro === "confirmacao") {
      setError(
        "Esse link de confirmação não vale mais — pode ter vencido ou já ter sido usado. Peça um novo criando a conta de novo."
      );
      window.history.replaceState(null, "", "/entrar");
    }
    if (erro === "recuperacao") {
      setError(
        "Esse link de recuperação não vale mais — pode ter vencido ou já ter sido usado. Peça outro em \u201cEsqueci minha senha\u201d."
      );
      window.history.replaceState(null, "", "/entrar");
    }
  }, []);

  function trocarModo(proximo: Modo) {
    setModo(proximo);
    setError(null);
    setAviso(null);
  }

  async function entrar() {
    setError(null);
    setLoading(true);

    const supabase = await carregarCliente();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setLoading(false);
      setError(traduzir(signInError.message));
      return;
    }

    // Sem router.refresh() aqui: ele disparava uma segunda renderização no
    // servidor, em paralelo com a navegação. Rota dinâmica não fica em cache
    // no roteador (Next 15), então o replace já busca tudo com a sessão nova.
    // O botão continua em "Entrando…" até a tela trocar — antes ele voltava
    // a ficar clicável no meio da navegação e parecia que nada tinha acontecido.
    router.replace(next ?? "/");
  }

  /** O link do e-mail leva o next junto, pra cair no convite depois. */
  const destinoConfirmar = () =>
    `${window.location.origin}/auth/confirmar` +
    (next ? `?next=${encodeURIComponent(next)}` : "");

  async function criar() {
    setError(null);

    if (!nome.trim()) return setError("Diga como quer ser chamado.");

    const idade = idadeEm(nascimento);
    if (idade === null) return setError("Confira sua data de nascimento.");
    if (idade < IDADE_MINIMA)
      return setError(`O RumoFácil é para maiores de ${IDADE_MINIMA} anos.`);

    if (!aceite)
      return setError("Para criar a conta, aceite os termos e a política de privacidade.");

    if (password.length < 6)
      return setError("A senha precisa ter pelo menos 6 caracteres.");

    setLoading(true);

    const supabase = await carregarCliente();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // O gatilho do banco lê isto: nome do perfil, versão dos termos
        // aceitos e a declaração de idade. A data de nascimento NÃO vai.
        data: {
          display_name: nome.trim(),
          terms_version: TERMOS_VERSAO,
          adult_declared: true,
          receipts_consent: consenteRecibos,
        },
        emailRedirectTo: destinoConfirmar(),
      },
    });

    setLoading(false);

    if (signUpError) {
      setError(traduzir(signUpError.message));
      return;
    }

    // Por segurança o Supabase responde "sucesso" mesmo pra e-mail que já
    // tem conta — pra ninguém descobrir quem está cadastrado. Então esta
    // tela é sempre a mesma, independente do que aconteceu de verdade.
    setMotivo("cadastro");
    trocarModo("confira");
  }

  /**
   * O link do e-mail troca o código por sessão em /auth/confirmar e cai em
   * /auth/redefinir já logado — lá a pessoa escolhe a senha nova.
   */
  async function pedirRedefinicao() {
    setError(null);
    setLoading(true);

    const supabase = await carregarCliente();
    // URL limpa, sem query: com `?next=` o Supabase descartava o destino e
    // mandava pra home já logado, pulando a tela de trocar a senha.
    const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/nova-senha`,
    });

    setLoading(false);

    if (e) {
      setError(traduzir(e.message));
      return;
    }
    // Mesma lógica: não revela se o e-mail existe.
    setMotivo("senha");
    trocarModo("confira");
  }

  async function reenviar() {
    setAviso(null);
    setError(null);
    if (motivo === "senha") return pedirRedefinicao();
    setLoading(true);

    const supabase = await carregarCliente();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: destinoConfirmar() },
    });

    setLoading(false);

    if (resendError) {
      setError(traduzir(resendError.message));
      return;
    }
    setAviso("Mandamos de novo. Vale conferir a caixa de spam também.");
  }

  const enviar = modo === "entrar" ? entrar : criar;
  const podeEnviar =
    !loading &&
    Boolean(email) &&
    Boolean(password) &&
    (modo === "entrar" || (Boolean(nome) && Boolean(nascimento) && aceite));

  return (
    <main className="scope-us flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <span
            className="mb-5 block h-1 w-10 rounded-full bg-[var(--color-couple)]"
            aria-hidden="true"
          />
          <h1 className="text-3xl font-bold">RumoFácil</h1>
          <p className="mt-2 text-sm text-[var(--color-text-dim)]">
            Cada um lança o seu. A casa vê o todo.
          </p>
        </div>

        {modo === "esqueci" ? (
          <div className="flex flex-col gap-4">
            <div>
              <p className="font-semibold">Esqueceu a senha?</p>
              <p className="mt-1 text-sm text-[var(--color-text-dim)]">
                Mandamos um link pro seu e-mail pra você escolher outra.
              </p>
            </div>

            <TextField
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              autoFocus
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && pedirRedefinicao()}
            />

            {error && <Erro>{error}</Erro>}

            <button
              type="button"
              onClick={pedirRedefinicao}
              disabled={loading || !email}
              className="min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
            >
              {loading ? "Mandando…" : "Mandar link"}
            </button>

            <button
              type="button"
              onClick={() => trocarModo("entrar")}
              className="text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
            >
              Voltar
            </button>
          </div>
        ) : modo === "confira" ? (
          <div className="flex flex-col gap-4">
            <div className="card px-5 py-6">
              <p className="font-semibold">Confira seu e-mail</p>
              <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                {motivo === "senha"
                  ? "Se esse e-mail tem conta, mandamos um link para escolher uma senha nova para "
                  : "Mandamos um link de confirmação para "}
                <strong className="text-[var(--color-text)]">
                  {email.trim()}
                </strong>
                {motivo === "senha" ? "." : ". Clique nele para começar."}
              </p>
            </div>

            {aviso && (
              <p className="rounded-lg border border-[var(--color-in)]/40 bg-[var(--color-in)]/10 px-3.5 py-2.5 text-sm text-[var(--color-in)]">
                {aviso}
              </p>
            )}
            {error && <Erro>{error}</Erro>}

            <button
              type="button"
              onClick={reenviar}
              disabled={loading}
              className="min-h-11 rounded-lg border border-[var(--color-line)] px-4 text-sm font-medium text-[var(--color-text-dim)] transition-colors hover:text-[var(--color-text)] disabled:opacity-40"
            >
              {loading ? "Reenviando…" : "Não chegou? Reenviar e-mail"}
            </button>

            <button
              type="button"
              onClick={() => trocarModo("entrar")}
              className="text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
            >
              Já confirmei, quero entrar
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              role="group"
              aria-label="Entrar ou criar conta"
              className="inline-flex items-center gap-1 self-start rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1"
            >
              {(
                [
                  { value: "entrar" as Modo, label: "Entrar" },
                  { value: "criar" as Modo, label: "Criar conta" },
                ]
              ).map((opcao) => (
                <button
                  key={opcao.value}
                  type="button"
                  aria-pressed={modo === opcao.value}
                  onClick={() => trocarModo(opcao.value)}
                  className={[
                    "flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                    modo === opcao.value
                      ? "bg-[var(--scope)] text-[var(--color-ink)]"
                      : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                  ].join(" ")}
                >
                  {opcao.label}
                </button>
              ))}
            </div>

            {modo === "criar" && (
              <TextField
                label="Como quer ser chamado"
                autoComplete="given-name"
                value={nome}
                autoFocus
                placeholder="Seu primeiro nome"
                onChange={(event) => setNome(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && enviar()}
              />
            )}

            {modo === "criar" && (
              <div className="flex flex-col gap-1.5">
                <DateField
                  label="Data de nascimento"
                  value={nascimento}
                  max={toISODate(new Date())}
                  onChange={(event) => setNascimento(event.target.value)}
                />
                <span className="text-xs text-[var(--color-text-faint)]">
                  Só pra confirmar que você tem {IDADE_MINIMA} anos ou mais. A
                  data não é guardada.
                </span>
              </div>
            )}

            <TextField
              label="E-mail"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && enviar()}
            />

            <PasswordField
              label="Senha"
              autoComplete={
                modo === "criar" ? "new-password" : "current-password"
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && enviar()}
            />
            {modo === "criar" && (
              <p className="-mt-2 text-xs text-[var(--color-text-faint)]">
                Pelo menos 6 caracteres.
              </p>
            )}

            {modo === "criar" && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-[var(--color-text-dim)]">
                <input
                  type="checkbox"
                  checked={aceite}
                  onChange={(event) => setAceite(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-couple)]"
                />
                <span>
                  Tenho {IDADE_MINIMA} anos ou mais e aceito os{" "}
                  <Link href="/termos" target="_blank" className="underline hover:text-[var(--color-text)]">
                    termos de uso
                  </Link>{" "}
                  e a{" "}
                  <Link href="/privacidade" target="_blank" className="underline hover:text-[var(--color-text)]">
                    política de privacidade
                  </Link>
                  .
                </span>
              </label>
            )}

            {/* Separada e desmarcada de propósito: recibo pode ter dado de saúde,
                e consentimento pra dado sensível tem que ser específico e livre
                (LGPD art. 11). Não marcar não impede nada — dá pra permitir
                depois em Ajustes, ou na hora de guardar o primeiro recibo. */}
            {modo === "criar" && (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm text-[var(--color-text-dim)]">
                <input
                  type="checkbox"
                  checked={consenteRecibos}
                  onChange={(event) => setConsenteRecibos(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-couple)]"
                />
                <span>
                  Opcional: permito guardar fotos dos meus recibos, que podem conter dados de
                  saúde (como os de farmácia). Dá pra mudar depois em Ajustes.
                </span>
              </label>
            )}

            {info && (
              <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-text-dim)]">
                {info}
              </p>
            )}
            {error && <Erro>{error}</Erro>}

            <button
              type="button"
              onClick={enviar}
              disabled={!podeEnviar}
              className="mt-2 min-h-11 rounded-lg bg-[var(--color-couple)] px-4 font-semibold text-[var(--color-ink)] transition-opacity disabled:opacity-40"
            >
              {loading
                ? modo === "criar"
                  ? "Criando…"
                  : "Entrando…"
                : modo === "criar"
                  ? "Criar conta"
                  : "Entrar"}
            </button>

            {modo === "entrar" && (
              <button
                type="button"
                onClick={() => trocarModo("esqueci")}
                className="self-start text-sm text-[var(--color-text-faint)] underline hover:text-[var(--color-text)]"
              >
                Esqueci minha senha
              </button>
            )}
          </div>
        )}

        <Rodape />
      </div>
    </main>
  );
}

function Rodape() {
  return (
    <nav className="mt-10 flex flex-wrap gap-4 text-xs text-[var(--color-text-faint)]">
      <Link href="/termos" className="underline hover:text-[var(--color-text)]">
        Termos de uso
      </Link>
      <Link href="/privacidade" className="underline hover:text-[var(--color-text)]">
        Política de privacidade
      </Link>
    </nav>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-2.5 text-sm text-[var(--color-out)]"
    >
      {children}
    </p>
  );
}
