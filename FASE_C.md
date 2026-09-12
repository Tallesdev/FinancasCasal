# Fase C — Casa com até 6 pessoas e convite

**Status:** No ar desde 11/09/2026 — migração 005 rodada, código em produção. Falta o teste de ponta a ponta com uma pessoa nova (§8).
**Depende de:** Fase B no ar com o cadastro funcionando de verdade (o toggle
"Allow new users to sign up" ligado — ver `FASE_B.md` §2).
**Decisão que dirige tudo (10/09/2026):** uma casa tem **até 6 pessoas**, não
duas. "Um pai quer fazer a finança da família." O `PLANO_V2.md` recomendava
duas; essa recomendação está superada.

---

## TL;DR

Hoje cada conta nova nasce numa casa de uma pessoa só, e a única forma de
juntar duas pessoas é o `seed.sql` na mão. Depois desta fase: quem está numa
casa gera um **link de convite**, manda pelo WhatsApp, a outra pessoa abre,
entra (ou cria conta) e aceita — e passa a fazer parte da casa, trazendo o
histórico dela junto. A interface deixa de pressupor "eu + uma outra pessoa"
e passa a lidar com "eu + até cinco".

## A descoberta que simplifica tudo

O `PLANO_V2.md` dizia: *"só é possível aceitar um convite se sua casa atual
não tiver nenhum lançamento"*, por medo de ter que "juntar" dados de duas
casas. **Esse medo era infundado.** Olhando o schema: `expenses`, `incomes`,
`investments`, `cards`, `categories`, `bank_accounts` — todas são chaveadas
por `user_id`. Nenhuma tabela de dado tem `household_id`. A casa só existe em
`profiles.household_id`, e a RLS deriva "quem é da minha casa" a partir dele.

Consequência: **mudar uma pessoa de casa é atualizar um campo em uma linha.**
Os lançamentos dela continuam sendo dela, e no instante seguinte já aparecem
na visão "todos" da casa nova. Não existe migração de dado, não existe
conflito, não existe duplicação. A regra de "casa vazia" cai.

A única regra que sobra: **você só entra numa casa se estiver sozinho na sua.**
Se já divide casa com alguém, precisa sair dela primeiro (§3.4). Isso evita a
pessoa "puxar" uma casa inteira para dentro de outra sem os outros saberem.

## O que NÃO está nesta fase

- **Tirar alguém da casa.** Não há papéis (RF02 do PRD: todo mundo tem os
  mesmos poderes), então não existe "dono" com direito de expulsar. Cada um
  só sai por conta própria. Se isso fizer falta na prática, é conversa nova —
  porque exige inventar hierarquia, que o PRD rejeita de propósito.
- **E-mail de convite.** O convite é um link para compartilhar (§2). Sem
  SMTP, sem Resend, sem limite de envio. Se um dia quiser mandar por e-mail
  também, é acréscimo, não mudança.
- **Convite para quem não tem conta ainda, com cadastro embutido.** Quem
  recebe o link e não tem conta cria uma normalmente (Fase B) e o link
  continua esperando — o `?next=` da §4.3 garante que ela cai no convite
  depois de confirmar o e-mail.

---

## 1. Banco de dados

### 1.1 Tabela de convites

```sql
create table if not exists public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  -- O que vai no link. Aleatório e longo: não dá pra chutar.
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Opcional. Se preenchido, só esse e-mail consegue aceitar.
  invited_email text,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_by   uuid references public.profiles(id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists household_invites_household_idx
  on public.household_invites (household_id);
```

### 1.2 Limite de 6 e o que ele vale

O limite é checado em dois lugares, porque um sem o outro deixa buraco:

- **Ao criar convite:** membros atuais + convites pendentes ≤ 6. Senão a
  pessoa cria 10 convites com 2 membros e a casa estoura quando todos
  aceitam.
- **Ao aceitar:** membros atuais < 6. Senão dois convites aceitos ao mesmo
  tempo furam o limite (o primeiro passa na checagem de criação, o segundo
  também, os dois aceitam).

Os dois ficam **dentro das funções** (§1.4), não na interface. A interface só
repete o aviso para a pessoa entender; quem garante é o banco.

### 1.3 RLS

```sql
alter table public.household_invites enable row level security;

-- Quem é da casa vê os convites da casa (pra listar pendentes e revogar).
drop policy if exists household_invites_select on public.household_invites;
create policy household_invites_select on public.household_invites
  for select using (household_id = public.my_household_id());

-- Revogar = marcar status. Só quem é da casa.
drop policy if exists household_invites_update on public.household_invites;
create policy household_invites_update on public.household_invites
  for update using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());
```

**Sem política de `insert` nem de `delete`.** Criar convite passa pela função
`create_invite()` (§1.4), que valida o limite — se a interface pudesse
inserir direto, o limite seria opcional. Apagar não existe: revoga-se.

**A pessoa convidada não tem `select` na tabela** — ela não é da casa ainda.
O que ela vê vem de `get_invite(token)`, que devolve só o necessário.

### 1.4 As quatro funções

Todas `security definer`, mesmo mecanismo de `handle_new_user`. Cada uma
valida sozinha o que precisa; nenhuma confia na interface.

**`create_invite(p_email text default null)` → `text` (o token)**
1. Conta membros da minha casa + convites pendentes não vencidos.
2. Se ≥ 6, erro: `"A casa já está no limite de 6 pessoas."`
3. Insere o convite e devolve o token.

**`get_invite(p_token text)` → uma linha ou nada**
Devolve `{ household_name, inviter_name, inviter_color, member_count,
expires_at, invited_email_locked boolean }`. Nada de `household_id`, nada de
e-mail em texto — só o que a tela do convite precisa mostrar. Token inválido,
vencido ou já usado devolve zero linhas; a tela trata como "esse convite não
vale mais".

**`accept_invite(p_token text)` → `void`**
Na ordem, e cada falha é um erro com mensagem em português:
1. Convite existe, `pending`, não vencido.
2. Se `invited_email` está preenchido, tem que bater com o e-mail de
   `auth.uid()`.
3. Quem aceita **não é membro de nenhuma casa com mais gente** — se a casa
   atual dela tem outra pessoa, erro: `"Você já divide uma casa. Saia dela
   antes de entrar em outra."`
4. A casa do convite tem menos de 6 membros.
5. **Cor:** se a cor de quem entra é igual à de alguém que já está na casa,
   troca por uma cor livre da paleta (10 cores, 6 pessoas: sempre sobra).
6. Guarda a casa antiga, atualiza `profiles.household_id` para a nova.
7. Se a casa antiga ficou sem ninguém, apaga ela (era a solo).
8. Marca o convite como `accepted`, com `accepted_by` e `accepted_at`.

Tudo numa transação — a função plpgsql já é atômica. Ou acontece inteiro, ou
nada.

**`leave_household()` → `void`**
1. Cria uma casa nova ("Minha casa") e move a pessoa para ela.
2. Se a casa antiga ficou vazia, apaga.
3. Convites pendentes que essa pessoa criou na casa antiga viram `revoked`
   — ela não é mais de lá, o convite dela não vale mais.

Sair nunca falha por "ser o último": o último que sai leva a casa embora e
ela some. Não sobra casa fantasma.

### 1.5 `households` ganha nome editável

```sql
drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update using (id = public.my_household_id())
  with check (id = public.my_household_id());
```

Qualquer membro renomeia. "Minha casa" → "Família Silva". Sem hierarquia,
sem dono.

---

## 2. O convite é um link, não um e-mail

**Por quê:** todo mundo aqui está no WhatsApp. Um link copiado resolve o
problema sem infraestrutura nenhuma — sem SMTP, sem serviço de e-mail, sem
limite de envio, sem cair em spam, sem template. É também o que a Fase B
mostrou: o remetente embutido do Supabase mal aguenta o cadastro; não vale
pendurar mais uma coisa nele.

**Formato:** `https://financascasal-pi.vercel.app/convite/<token>`. O token
tem 48 caracteres hexadecimais aleatórios — não é adivinhável, e não expõe
nada sobre a casa.

**Trava opcional por e-mail:** quem convida pode dizer "só fulano@x.com pode
aceitar". Útil quando o link pode vazar (grupo de família, por exemplo). Sem
a trava, qualquer um com o link entra — que é o comportamento normal de
"link de convite" que as pessoas já conhecem de outros apps.

**Validade:** 7 dias. Depois disso o link diz "esse convite venceu, peça
outro". Convite pendente ocupa vaga no limite de 6 (§1.2), então vencer é o
que libera a vaga de volta.

---

## 3. Interface

### 3.1 `ScopeProvider` — de `partner` para `members`

Hoje o contexto expõe `partner: Profile | null` — literalmente "a outra
pessoa". Com até 6, vira:

```ts
/** Todo mundo da casa, incluindo eu. Ordenado por nome. */
members: Profile[];
/** Todo mundo menos eu. */
others: Profile[];
```

`userIds` no escopo `us` passa a ser `members.map((m) => m.id)`. É a única
mudança de lógica; o resto do contrato (`scope`, `setScope`, `me`,
`scopeClass`, `scopeStyle`) fica igual.

O `layout.tsx` já busca `profiles` com `select("*")` — a RLS devolve todo
mundo da casa. Hoje ele pega `find(p => p.id !== user.id)` e chama de
`partner`; passa a pegar a lista inteira.

### 3.2 `ScopeToggle` e `ScopeHeading` — o rótulo do "todos"

Hoje: `"Talles"` / `"Talles + Duda"`. Com 6 pessoas, "Talles + Duda + Ana +
Bia + Caio + Dudu" não cabe num toggle de celular.

Regra:
- **1 pessoa** (casa solo): o toggle **não aparece**. Não faz sentido
  escolher entre "eu" e "eu". A tela mostra só o nome.
- **2 pessoas:** `"A + B"`, como hoje. É o caso do casal e fica bonito.
- **3 ou mais:** `"Todos"`. Na `ScopeHeading`, o subtítulo lista os nomes:
  *"Talles, Duda, Ana e Bia — somados."*

Isso resolve o "toggle redundante" que a Fase B deixou para quem se cadastra
sozinho.

### 3.3 Os três mapas `profileById`

`gastos`, `investimentos` e `renda` montam um mapa `{ [id]: { name, color } }`
a partir de `me` e `partner`. Passa a ser a partir de `members` — um `for`
em vez de dois `if`. `OwnerTag` já recebe cor de verdade (Fase B), então
funciona para 6 sem mudar nada.

### 3.4 Ajustes → "Minha casa"

Nova seção, ao lado de "Meu perfil":

- **Nome da casa**, editável (§1.5).
- **Quem está aqui:** lista dos membros, cada um com sua bolinha de cor e
  nome. Você aparece marcado como "você".
- **Convidar alguém:** botão que chama `create_invite()`, mostra o link
  pronto com um botão "Copiar" e um "Compartilhar" (a Web Share API abre a
  folha nativa do celular — WhatsApp aparece ali). Campo opcional "só este
  e-mail pode aceitar". Se a casa está no limite, o botão some e um texto
  explica.
- **Convites pendentes:** lista com e-mail (se travado) e validade, e um
  "Revogar" em cada um.
- **Sair da casa:** no rodapé da seção, em tom de perigo, com confirmação em
  dois toques (o `DeleteButton` que já existe serve). Explica: *"Seus
  lançamentos vão com você. Você vai para uma casa nova, sozinho."* Só
  aparece se a casa tem mais de uma pessoa — sair de uma casa solo não
  significa nada.

### 3.5 Página do convite: `/convite/[token]`

Quem abre o link vê:

- **Sem sessão:** a tela mostra quem convidou e o nome da casa (via
  `get_invite`, que é `security definer` e não precisa de sessão para ler),
  e dois botões: "Entrar" e "Criar conta", os dois com `?next=/convite/<token>`
  (§4.3). Depois de logar, volta para cá sozinha.
- **Com sessão:** o mesmo cartão, mais o botão "Entrar na casa". Se ela já
  divide uma casa, o botão vira aviso: *"Você já está em uma casa com outras
  pessoas. Para aceitar, saia dela primeiro em Ajustes."*
- **Convite inválido/vencido/usado:** *"Esse convite não vale mais. Peça um
  novo para quem te convidou."*
- **Aceitou:** redireciona para `/` com a casa nova já carregada.

---

## 4. Rotas e fluxo

### 4.1 Middleware

`/convite/` entra na lista de rotas públicas (junto de `/entrar` e
`/auth/`), porque a pessoa pode chegar sem sessão e precisa **ver** o convite
antes de decidir entrar. Aceitar exige sessão, mas isso a função do banco
garante (`auth.uid()` nulo → erro), não o middleware.

### 4.2 Nenhuma rota de servidor nova

Tudo passa pelas quatro funções via `supabase.rpc(...)` a partir do cliente,
como o resto do app. `get_invite` é a única chamada sem sessão, e ela é
segura de propósito: devolve nome e cor, nada mais.

### 4.3 `?next=` — voltar para o convite depois de logar

Hoje `/entrar` redireciona para `/` sempre. Ganha um parâmetro `next`:

- **Login:** `/entrar?next=/convite/abc` → depois de entrar, `router.replace(next)`.
- **Cadastro:** o `emailRedirectTo` passa a ser
  `/auth/confirmar?next=/convite/abc`, e a rota `confirmar` redireciona para
  `next` em vez de `/`.

**Regra de segurança:** `next` só é honrado se começar com `/` e não com
`//` — caminho relativo dentro do app, nunca URL externa. Sem isso vira um
"open redirect" (link que parece do app mas manda a pessoa para outro site).

---

## 5. O que muda nos textos

O app foi escrito falando "os dois", "o casal", "a outra pessoa". Com 6, isso
fica errado em vários lugares. Lista do que ajustar, com o `grep` para achar:

| Hoje | Depois |
| --- | --- |
| "Renda, gastos e investimentos dos dois somados." | "…de todos somados." |
| "Cada um lança o seu. Os dois veem o todo." (login) | "Cada um lança o seu. A casa vê o todo." |
| "A outra pessoa da casa" (comentários) | "As outras pessoas da casa" |
| `--color-couple` (token CSS) | fica — é a cor de "junto", o nome é só interno |

`grep -rn "dois\|casal\|partner" src/` acha tudo. Os comentários em código
também merecem, para o próximo leitor não achar que o app ainda é de dois.

---

## 6. Coisas que não podem regredir

- **Talles e Duda continuam na mesma casa**, sem fazer nada. A casa deles já
  existe com dois membros; `members` vai ter os dois; o toggle mostra
  `"Talles + Duda"` pela regra de 2 pessoas. Nada muda para vocês.
- **Visão "todos" continua somando só a casa.** `userIds` vem de `members`,
  que vem da RLS, que vem de `household_member_ids()`. Mesma cadeia de hoje,
  só com uma lista em vez de um par.
- **Cartão e conta continuam privados** — a RLS deles é por `user_id`, não
  por casa. Seis pessoas na casa, cada uma vê só os próprios cartões.
- **Ciclo do cartão continua individual.** É por cartão, cartão é privado.

---

## 6.1 Acrescentado depois de entrar no ar (12/09/2026)

- **Código curto por convite** (migração 006): além do link, cada convite tem
  um código de 8 caracteres sem ambiguidade (sem 0/O, 1/I/L) para ditar por
  telefone. `get_invite` e `accept_invite` aceitam token **ou** código no
  mesmo parâmetro; `/convite` sem nada é a tela de digitar.
- **Cor da casa** (migração 007): o escopo "todos" deixa de usar o roxo fixo
  do CSS e passa a usar `households.color`, escolhido em Ajustes → Minha
  casa. Simetria com a cor por pessoa da Fase B.
- **Ajustes no desktop:** a coluna lateral ganhou "Perfil e casa". Sem isso,
  perfil, casa e convites eram inalcançáveis no navegador — o atalho no
  header é `md:hidden`. Bug encontrado no uso real.

## 7. Decisões que ainda são suas

1. **"Todos" ou o nome da casa no toggle?** Com 3+ pessoas, o toggle pode
   dizer `"Todos"` ou `"Família Silva"` (o nome da casa). Nome da casa é
   mais bonito quando a pessoa deu um; `"Todos"` é mais previsível. Proponho:
   nome da casa se ela foi renomeada, `"Todos"` se ainda é "Minha casa".
2. **Trava por e-mail ligada por padrão?** Proponho **desligada** — link
   simples é o comportamento que as pessoas esperam. Quem quiser trava,
   marca.
3. **7 dias de validade está bom?** É o que eu chutei. Pode ser 3, pode ser
   30 — muda um número só.

---

## 8. Checklist de aceite

- [ ] Uma pessoa numa casa solo gera um link em Ajustes → Minha casa.
- [ ] Outra pessoa (nova, sem conta) abre o link, cria conta, confirma o
      e-mail, **cai de volta no convite**, aceita, e vê a casa com os dois.
- [ ] Quem convidou vê a pessoa nova na lista de membros e no toggle.
- [ ] Os lançamentos de quem entrou aparecem na visão "todos" da casa.
- [ ] Uma sétima pessoa não consegue entrar: o link diz que a casa está
      cheia.
- [ ] Alguém que já divide casa tenta aceitar outro convite e recebe o aviso
      de "saia da sua primeiro".
- [ ] "Sair da casa" leva a pessoa para uma casa solo nova, com os
      lançamentos dela intactos.
- [ ] Talles e Duda não notam diferença nenhuma.

## 9. Ordem de execução

| Passo | Quem |
| --- | --- |
| 1. Fechar as três decisões da §7 | Você |
| 2. Migração 005 (§1) | Eu escrevo, você roda |
| 3. Código (§3, §4, §5) | Eu |
| 4. Checklist (§8) com uma conta de teste | Os dois |
| 5. Subir | Eu |
