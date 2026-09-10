# Fase B — Cadastro público

**Status:** Implementada em 10/09/2026 — o código descrito abaixo existe e
compila. Falta rodar a migração 004 e ligar o cadastro no painel do Supabase
(passos 1 e 2 da §9) antes de subir.
**Depende de:** Fase A publicada (feito em 10/09/2026).
**Não depende de:** Fase C (convite), D (áudio) ou E (foto). Esta fase é
autossuficiente — dá para parar aqui e o app continua inteiro.

---

## TL;DR

Hoje, uma conta só existe se alguém for ao painel do Supabase e criar na mão.
Depois desta fase, qualquer pessoa cria a própria conta pela tela de login, com
confirmação por e-mail, e ganha uma casa própria automaticamente — sem ninguém
tocar no banco. A cor de identidade deixa de ser um binário fixo (verde ou
laranja) e vira escolha livre numa paleta, igual à que já existe para
categorias e cartões.

## O que NÃO está nesta fase

- **Juntar duas contas numa casa** (convite, "Talles + Duda") é a Fase C,
  documentada à parte em `PLANO_V2.md`. Depois desta fase, cada pessoa nova
  fica numa casa de uma pessoa só — sozinha, mas funcional.
- **Migrar as contas do Talles e da Duda para o novo modelo de cor.** Elas já
  têm `accent` preenchido; a migração faz o backfill automático (ver §1.1),
  então nada precisa ser feito na mão para elas.
- **Quantas pessoas cabem numa casa.** Continua sendo, no máximo, duas — é o
  que o `ScopeToggle` já pressupõe (`me` / `us`, sem terceira opção). Cor
  livre por pessoa não muda esse limite; resolve identidade visual, não
  tamanho de casa.

---

## 1. Banco de dados

### 1.1 `profiles.accent` → `profiles.color`

Hoje: `accent text not null default 'a' check (accent in ('a', 'b'))`.
Depois: `color text not null`, hexadecimal livre, mesma paleta usada em
categorias e cartões (`src/lib/palette.ts`).

A tabela já tem duas linhas de verdade (Talles, Duda) — a migração precisa
fazer backfill antes de travar a coluna como obrigatória. Fica tudo dentro de
uma transação, para não deixar a tabela pela metade se algo falhar no meio.

```sql
-- Migração 004 — Cadastro público (parte 1: cor por pessoa)
-- Seguro num banco com dados: profiles já tem 2 linhas, o backfill roda
-- antes de qualquer constraint travar a coluna.

begin;

alter table public.profiles add column if not exists color text;

update public.profiles
set color = case accent
  when 'a' then '#7FD1AE'
  when 'b' then '#E9A13B'
  else '#7FD1AE'
end
where color is null;

alter table public.profiles alter column color set default '#7FD1AE';
alter table public.profiles alter column color set not null;

do $$ begin
  alter table public.profiles
    add constraint profiles_color_format check (color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;

commit;
```

**A coluna `accent` fica onde está, sem uso.** Não é apagada — mesmo padrão já
usado com `bank_accounts` neste projeto: mudar de propósito ou aposentar um
campo nunca justifica um `drop` sem necessidade. Se um dia sobrar, uma
migração futura remove; não precisa ser agora.

### 1.2 Auto-provisionamento no cadastro

Toda pessoa nova precisa nascer com: um perfil, uma casa própria (de uma
pessoa só, por enquanto), um nome e uma cor. Isso não pode depender de alguém
rodar SQL na mão — é exatamente o gargalo que esta fase remove.

Padrão oficial do próprio Supabase para isto: um gatilho em `auth.users` que
roda toda vez que alguém se cadastra.

```sql
-- Migração 004 — Cadastro público (parte 2: auto-provisionamento)

create or replace function public.random_palette_color()
returns text
language sql
as $$
  select (array[
    '#7FD1AE', '#E9A13B', '#C77DFF', '#E06C7B', '#6C8AE4',
    '#4CC9F0', '#F4A261', '#95D5B2', '#B5838D', '#8B93A7'
  ])[floor(random() * 10 + 1)::int];
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_name text;
begin
  -- Defesa contra o gatilho rodar duas vezes pro mesmo usuário — não deveria
  -- acontecer, mas custa nada não duplicar perfil se acontecer.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.households (name) values ('Minha casa') returning id into v_household;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, household_id, display_name, color)
  values (new.id, v_household, v_name, public.random_palette_color());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

**Por que isso não quebra o Talles e a Duda:** o gatilho só dispara em
`insert` novo em `auth.users`. As duas contas já existem — o gatilho nunca
roda para elas retroativamente. Zero efeito sobre quem já está cadastrado.

**Por que não precisa de nenhuma política de RLS nova:** a função é
`security definer`, criada pela mesma sessão (SQL Editor) que já criou
`my_household_id()` e `household_member_ids()` — todas rodam com os
privilégios de quem as criou, não da pessoa que está se cadastrando. É esse
mecanismo que já sustenta a RLS do projeto inteiro; esta função só usa o
mesmo caminho. Confirmei no schema atual: `profiles` não tem política de
`insert` para usuário comum (só `profiles_select` e `profiles_update_own`) —
e não precisa ganhar uma, porque ninguém além do gatilho insere ali.

### 1.3 O que continua exatamente igual

- RLS de `expenses`, `incomes`, `investments`, `categories`: nenhuma mudança.
  Elas já filtram por `household_member_ids()`, que é genérico — nunca teve
  UUID de vocês dois escrito em lugar nenhum.
- `cards`, `bank_accounts`: privacidade por dono, sem mudança.
- Todas as funções de relatório (`monthly_summary`, `category_ranking`,
  `card_cycle_bounds`, as três `*_in_window`): nenhuma toca em `profiles`,
  nenhuma muda.

---

## 2. Painel do Supabase — passos manuais

Isto não é código, é configuração. Sem isso, o cadastro público não liga
mesmo com o banco pronto.

1. **Authentication → Sign In / Providers → Email → Enable sign ups: ON.**
   É o oposto exato do passo 1.1.4 do `INSTRUCOES.md` original — na v1 isso
   ficava desligado de propósito, porque só vocês dois deveriam entrar. Agora
   é o contrário de propósito.
2. **Confirm email: ON**, se já não estiver. Sem confirmação, qualquer um
   cria conta com e-mail de qualquer um — não é opcional para um cadastro
   público de verdade.
3. **Authentication → URL Configuration**: conferir que a URL de produção
   está em **Site URL**, e que **Redirect URLs** tem uma entrada cobrindo
   `https://financascasal-pi.vercel.app/**` (o `/**` cobre `/auth/confirmar`
   junto, sem precisar cadastrar caminho por caminho). Se só tiver a raiz sem
   o coringa, o link do e-mail de confirmação será rejeitado pelo Supabase por
   segurança — vale conferir antes de testar, é o tipo de coisa que falha
   silenciosamente e é chato de depurar depois.
   **Aprendido no primeiro teste (10/09):** no painel novo do Supabase este
   toggle mudou de lugar. Fica em **Authentication → Sign In / Providers**, no
   topo da página, como **"Allow new users to sign up"** — separado do bloco do
   provedor Email logo abaixo. Ligar só o "Enable Email provider" não basta:
   o cadastro continua rejeitado com `signup_disabled`. O log de auth do
   projeto mostra esse código na hora; a tela agora também diz isso em
   português em vez do texto genérico.

   **Limite de e-mail do Supabase (risco real):** o remetente embutido do
   Supabase manda poucos e-mails por hora (na casa de unidades, no plano
   grátis). Serve para vocês testarem; **não serve para um cadastro público
   de verdade**. Antes de divulgar o app, configurar SMTP próprio em
   Authentication → SMTP Settings — o Resend tem camada grátis (100/dia) e é
   o mesmo serviço que a Fase C vai precisar para convites. Sem isso, o
   terceiro cadastro do dia já pode ficar sem e-mail de confirmação.

4. **Authentication → Policies → Password** (opcional, recomendado): mínimo de
   6 caracteres é o padrão do Supabase. Para um app público, considerar subir
   para 8. Não bloqueia esta fase, é reforço de segurança.
5. **Authentication → Email Templates → Confirm signup** (opcional): o
   template padrão vem em inglês. Vale traduzir para português — cosmético,
   não bloqueia.

---

## 3. Fluxo de cadastro no app

### 3.1 `/entrar` ganha um segundo modo

Hoje a tela só faz login. Ganha um alternador "Entrar" / "Criar conta" no
topo, e o formulário de cadastro pede nome, e-mail e senha.

```ts
const { data, error } = await supabase.auth.signUp({
  email: email.trim(),
  password,
  options: {
    data: { display_name: nome.trim() },
    emailRedirectTo: `${window.location.origin}/auth/confirmar`,
  },
});
```

O `display_name` viaja em `raw_user_meta_data` e é o que o gatilho da §1.2 lê
para nomear o perfil. Se a pessoa não preencher (não deveria acontecer, o
campo é obrigatório no formulário, mas por robustez), o gatilho cai para o
que vem antes do `@` do e-mail.

### 3.2 Tela "Confira seu e-mail"

Depois do `signUp()` bem-sucedido, não existe sessão ainda (com confirmação
de e-mail ligada, o Supabase não loga ninguém antes de confirmar). A tela
troca para uma mensagem: *"Mandamos um link de confirmação para
{email}. Clique nele para começar."*, com um botão "Reenviar e-mail"
(`supabase.auth.resend({ type: "signup", email })`).

**Nota de segurança que muda a copy:** por padrão, desde 2023 o Supabase não
revela se um e-mail já está cadastrado — o `signUp()` responde "sucesso" tanto
para e-mail novo quanto para e-mail já confirmado antes, para não virar uma
forma de descobrir quem tem conta. Por isso a tela de "confira seu e-mail"
**sempre aparece igual**, independente do que aconteceu de verdade nos
bastidores. Não dá (nem deve) para diferenciar isso na interface.

### 3.3 Nova rota: trocar o código do e-mail por sessão

O link do e-mail de confirmação chega em `/auth/confirmar?code=xxxx`. Precisa
de uma rota de servidor para trocar esse código por uma sessão de verdade —
sem isso, a pessoa clica no link e nada acontece.

```ts
// src/app/auth/confirmar/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}/`);
  }

  return NextResponse.redirect(`${origin}/entrar?erro=confirmacao`);
}
```

Reaproveita o `createClient()` de servidor que já existe
(`src/lib/supabase/server.ts`) — os mesmos manipuladores de cookie que já
sustentam o login por senha sustentam isto também, sem nada novo ali.

### 3.4 Middleware precisa liberar esta rota

Hoje, `src/lib/supabase/middleware.ts:35` decide o que é rota pública assim:

```ts
const isLogin = request.nextUrl.pathname.startsWith("/entrar");
```

Sem ajuste, `/auth/confirmar` seria tratada como rota protegida — mas nesse
momento a pessoa ainda não tem sessão (é exatamente o que essa rota está
criando), então ela seria redirecionada para `/entrar` antes do código de
troca rodar. Precisa virar:

```ts
const isPublica =
  request.nextUrl.pathname.startsWith("/entrar") ||
  request.nextUrl.pathname.startsWith("/auth/");
```

E trocar as duas ocorrências de `isLogin` por `isPublica` nas linhas 37 e 43
do mesmo arquivo.

### 3.5 Mensagens de erro em português

O Supabase devolve mensagens em inglês. Mapear pelo menos:

| Situação | Copy |
| --- | --- |
| Senha curta (`Password should be at least 6 characters`) | "A senha precisa ter pelo menos 6 caracteres." |
| E-mail malformado | "Digite um e-mail válido." |
| Login com e-mail não confirmado (`Email not confirmed`) | "Confirme seu e-mail antes de entrar — veja sua caixa de entrada." |
| Login com credenciais erradas | Já existe: "E-mail ou senha não conferem." |

---

## 4. Cor por pessoa

### 4.1 O tipo `Profile`

`src/lib/types.ts` — troca:

```ts
// antes
accent: "a" | "b";

// depois
color: string;
```

### 4.2 `ScopeProvider` — de classe fixa para cor inline

Hoje (`src/components/ScopeProvider.tsx:56-57`):

```ts
const scopeClass =
  scope === "us" ? "scope-us" : me.accent === "b" ? "scope-b" : "scope-a";
```

Com cor livre, não existem mais só duas opções para virar classe CSS. O
`--scope` passa a ser setado inline, com a cor de verdade da pessoa:

```ts
const scopeStyle =
  scope === "us"
    ? undefined // .scope-us no className já resolve pro roxo fixo do casal
    : ({ "--scope": me.color } as React.CSSProperties);

const scopeClassName = scope === "us" ? "scope-us" : "";
```

E no JSX: `<div className={scopeClassName} style={scopeStyle}>`. O contrato
de `useScope()` para quem consome (`ScopeToggle`, `var(--scope)` em CSS)
não muda nada — só troca a origem do valor.

### 4.3 `globals.css` — o que sai

```css
/* removido: */
.scope-a  { --scope: var(--color-person-a); }
.scope-b  { --scope: var(--color-person-b); }

/* fica: */
.scope-us { --scope: var(--color-couple); }
```

`--color-person-a` e `--color-person-b` no `@theme` também podem sair — eram
só os dois tons fixos do binário antigo. `--color-couple` fica, é a cor de
"mais de uma pessoa junto" e continua fixa de propósito (não teria sentido
"escolher" a cor de um grupo).

### 4.4 `OwnerTag` — usar a cor de verdade, não mapear letra

Hoje (`src/components/ui.tsx:297-299`):

```ts
export function OwnerTag({ name, accent }: { name: string; accent: "a" | "b" }) {
  const color =
    accent === "b" ? "var(--color-person-b)" : "var(--color-person-a)";
```

Depois:

```ts
export function OwnerTag({ name, color }: { name: string; color: string }) {
```

E nos três lugares que chamam (`gastos/page.tsx:506`,
`investimentos/page.tsx:203`, `renda/page.tsx:238`), o mapa `profileById`
guarda `color: profile.color` em vez de `accent: profile.accent` — mesma
estrutura, campo diferente. É uma troca mecânica, os três arquivos têm
exatamente a mesma forma hoje (copiei o padrão de um para os outros na
época).

### 4.5 "Meu perfil" em Ajustes

Nova seção em `/ajustes` — nome de exibição e cor, reaproveitando o
`ColorPicker` que já existe em `src/components/ui.tsx` (o mesmo usado em
categorias e cartões, sem precisar de componente novo). A escrita usa a
política `profiles_update_own`, que **já existe e já permite isso** — nenhuma
mudança de RLS necessária, é só a tela que falta.

---

## 5. Rebranding para RumoFácil

Nome provisório, ainda não fechado com a Duda — mas já sai do lugar onde
"Finanças do casal" aparece para quem usa, não onde é só nome técnico interno.

**Muda** (usuário vê):
- `src/app/layout.tsx` — `metadata.title`, `metadata.description`,
  `appleWebApp.title`
- `public/manifest.webmanifest` — `name`, `short_name`
- `src/app/entrar/page.tsx` — o `<h1>` da tela de login
- `README.md` — título

**Fica como está** (só nome técnico, ninguém vê):
- Nome do repositório no GitHub (`FinancasCasal`)
- Nome do pacote em `package.json`
- URL da Vercel (`financascasal-pi.vercel.app`) — trocar domínio é decisão
  separada, de custo (registrar um domínio) e de paciência (propagação de
  DNS), não faz parte desta fase

---

## 6. Coisas que não podem regredir

Checagem de sanidade para depois de implementado — nada disto deveria mudar
de comportamento:

- Login com senha continua funcionando para Talles e Duda, sem eles
  precisarem fazer nada.
- O toggle "Talles" / "Talles + Duda" continua mostrando as cores certas
  (agora vindas de `color`, não de `accent`, mas visualmente idênticas —
  o backfill da §1.1 usa exatamente os mesmos hexadecimais que já existiam).
- Todo o resto do app — gastos, renda, investimentos, relatórios, ciclo do
  cartão — não tem nenhuma linha alterada nesta fase. Cor de pessoa e
  cadastro são as únicas superfícies tocadas.

---

## 7. Fora do escopo — fica para a Fase C

- Convite para juntar duas casas em uma.
- Qualquer forma de migrar dado de uma casa solo para uma casa de duas
  pessoas.
- Limite de uso por conta (relevante quando a Fase D/E trouxer custo de IA
  por chamada) — mencionado no `PLANO_V2.md`, não decidido ainda.

---

## 8. Checklist de aceite

- [ ] Uma pessoa nova consegue criar conta em `/entrar`, sem ninguém mexer no
      Supabase.
- [ ] Ela recebe e-mail de confirmação, clica, e cai logada em `/`.
- [ ] Ela vê uma casa própria, vazia, com o próprio nome e uma cor escolhida.
- [ ] Ela consegue trocar nome e cor em Ajustes → Meu perfil.
- [ ] Talles e Duda continuam logando normalmente, com as mesmas cores de
      antes, sem terem feito nada.
- [ ] Nenhuma tela de gasto/renda/investimento/relatório mudou de
      comportamento.

## 9. Ordem de execução

| Passo | Quem faz |
| --- | --- |
| 1. Rodar a migração 004 (SQL da §1.1 e §1.2) | Você, no SQL Editor |
| 2. Ligar cadastro público + confirmação de e-mail + conferir Redirect URLs | Você, no painel do Supabase |
| 3. Escrever o código (§3, §4, §5) e testar localmente | Eu |
| 4. Conferir a checklist de aceite (§8) | Os dois, antes do push |
| 5. Subir e verificar em produção | Eu |

Assim que você aprovar este documento, escrevo o código do passo 3 e te
aviso o que precisa ser feito dos passos 1 e 2 antes de eu poder testar de
verdade — nessa ordem, porque sem o banco pronto o código novo não tem para
onde escrever.
