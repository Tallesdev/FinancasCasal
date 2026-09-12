# LGPD — o que o RumoFácil faz, e o que falta

**Status:** Implementado em 12/09/2026. Falta rodar a migração 008 e
configurar três variáveis (§5) antes de subir.
**Aviso que vale para o documento inteiro:** foi escrito por IA a partir do
que o app faz de verdade, conferido no código e no banco. **Não é orientação
jurídica.** Serve pra saber onde olhar. Antes de divulgar amplamente, vale
uma revisão com profissional — principalmente dos textos de `/privacidade` e
`/termos`.

---

## Por que isto existe

Até a Fase D o app guardava números que as pessoas digitavam, de duas
pessoas que se conhecem. Duas coisas mudaram isso:

1. **Cadastro público (Fase B).** O responsável pelo app passa a ser
   *controlador* de dados de estranhos.
2. **Recibos (Fase E, planejada).** O app passa a guardar *documento* — e um
   recibo de farmácia é dado de saúde, que a LGPD trata como sensível.

---

## 1. Idade

**Decisão (12/09/2026):** perguntar a data de nascimento no cadastro, e só
aceitar 18+.

**A data não sai do navegador.** O formulário calcula a idade ali mesmo e o
banco grava só `adult_declared_at` — "declarou ser maior, em tal momento".
A LGPD tem o princípio da **minimização** (art. 6º, III): coletar só o
necessário pro fim. O fim é "tem 18 anos?", não "quando nasceu". Menos dado
guardado é menos dado pra vazar e menos dado pra responder por.

**O que isso não faz, e é bom saber:** autodeclaração não verifica nada.
Quem quiser mentir, mente. Não existe forma barata de verificar idade de
verdade, e é o padrão aceito para serviços como este. O valor está no
registro de que a pessoa declarou, e nos termos dizendo 18+.

**Por que 18+ importa aqui especificamente:** o caso de uso "um pai faz a
finança da família" convida filhos. Menor de idade exige consentimento
específico de um responsável (art. 14). A regra que resolve sem burocracia:
o filho aparece nos gastos do pai, sem conta própria. Está nos termos.

**Cálculo sem armadilha de fuso:** `idadeEm()` em `src/lib/legal.ts` compara
ano, mês e dia como números. Montar `new Date("AAAA-MM-DD")` cai em UTC e,
no Brasil, erra por um dia — justamente no dia do aniversário.

## 2. Aceite dos termos

Checkbox obrigatório no cadastro, com link pros dois textos (abrem em outra
aba pra não perder o formulário). O banco grava `terms_version` e
`terms_accepted_at`.

A versão mora em `TERMOS_VERSAO` (`src/lib/legal.ts`). **Mudança importante
nos textos = subir a versão.** Quando isso acontecer, dá pra pedir novo
aceite a quem aceitou a versão antiga — ainda não existe essa tela.

**Contas anteriores à migração 008** (Talles e Duda) ficam com as colunas
nulas. Não é erro: nasceram antes de existir termo.

## 3. Política de privacidade e termos de uso

`/privacidade` e `/termos`, públicas (quem ainda não tem conta precisa ler o
que aceita). Regra ao editar: **cada frase precisa ser verdade no código.**
O que foi conferido antes de escrever:

- **Nenhum rastreador** — sem analytics, sem publicidade. Buscado no código.
- **`localStorage`** guarda só duas preferências de tela (escopo e ocultar
  valores). Nada disso sai do aparelho.
- **Áudio** vai pra Groq e **não é guardado pelo app**; a transcrição só fica
  se a pessoa salvar o gasto.
- **Número de cartão e de conta nunca são pedidos** — só nomes e dias.
- **Quem da casa vê o quê:** lançamentos sim; cartões, contas e recibos não.

O responsável e o e-mail de contato vêm de variáveis de ambiente
(`NEXT_PUBLIC_RESPONSAVEL_NOME`, `NEXT_PUBLIC_CONTATO_EMAIL`). O repositório
é público: e-mail pessoal não deve ir pro histórico do git. Enquanto não
configurados, as páginas mostram em vermelho que falta — de propósito, pra
não passar despercebido.

## 4. Excluir conta

Ajustes → Excluir conta. Pede a senha e a palavra EXCLUIR.

**Conferido no banco antes de escrever** (12/09/2026): `auth.users` →
`profiles` é `CASCADE`, e `expenses`, `incomes`, `investments`, `cards`,
`categories`, `bank_accounts` e `household_invites.created_by` apontam pra
`profiles` com `CASCADE`. Apagar o usuário leva tudo. **A exceção é a casa:**
`households` não depende de `profiles`, então a rota apaga a casa se ela
ficou vazia — senão sobraria casa fantasma.

**Por que rota de servidor com chave secreta, e não função SQL:** apagar de
`auth.users` é mexer no schema de autenticação do Supabase. O caminho
suportado é a Admin API. Uma função dependente de privilégio do role
`postgres` em `auth` funcionaria hoje e poderia parar num ajuste de
permissão do Supabase — e isto é direito de exclusão, não pode quebrar em
silêncio.

**As três travas, cada uma contra uma coisa:**

| Trava | Protege contra |
| --- | --- |
| Sessão (o id vem dela, nunca do corpo do pedido) | apagar a conta de outra pessoa |
| Senha, conferida no servidor | celular desbloqueado na mão de outro |
| Digitar EXCLUIR | toque sem querer |

A senha é conferida tentando entrar com ela num cliente descartável — **sem
mandar e-mail**, porque o remetente do Supabase já é gargalo.

**Recibos (Fase E):** decisão de 12/09/2026 — somem junto, na hora. O lugar
está marcado na rota: apagar os objetos do R2 **antes** de apagar o usuário.

## 5. O que precisa de você

1. **Rodar a migração 008** (SQL na conversa / `supabase/migrations/`).
2. **Na Vercel**, três variáveis:
   - `SUPABASE_SECRET_KEY` — a chave **secreta** (`sb_secret_...`), em
     Project Settings → API Keys. **Sem `NEXT_PUBLIC_`.** Ela ignora RLS:
     vazar essa chave é entregar o banco inteiro.
   - `NEXT_PUBLIC_RESPONSAVEL_NOME` — quem responde pelo app.
   - `NEXT_PUBLIC_CONTATO_EMAIL` — de preferência um e-mail do app, não o
     pessoal.
3. Os mesmos três no `.env.local` para testar local.

## 6. O que ainda falta

Em ordem de importância:

- **Revisão profissional dos textos** antes de divulgar amplamente.
- **Exportar meus dados** (portabilidade, art. 18, V). Hoje a pessoa vê tudo
  no app mas não baixa. O "exportar CSV" do PRD resolve.
- **Consentimento específico do recibo** — especificado em `FASE_E.md` §3.6,
  entra junto com a Fase E.
- **Pedir novo aceite quando os termos mudarem** — só vira necessário na
  primeira mudança de versão.
- **SMTP próprio** — pendente desde a Fase B; sem ele, "esqueci minha senha"
  e cadastro dependem de um remetente que manda poucos e-mails por hora.

## 7. O que a LGPD pede e já está coberto

| Exigência | Onde |
| --- | --- |
| Identificar o controlador e um contato | `/privacidade` (via variáveis) |
| Informar o que coleta e para quê | `/privacidade` |
| Base legal | execução de contrato; consentimento pro recibo |
| Informar transferência internacional | `/privacidade` — Groq, Cloudflare |
| Informar com quem compartilha | `/privacidade` — casa e provedores |
| Minimização | data de nascimento não é guardada |
| Direito de exclusão | Ajustes → Excluir conta |
| Direito de correção | editar perfil e qualquer lançamento |
| Segurança | RLS no banco, chaves só no servidor, senha cifrada |
| Menores | 18+ declarado no cadastro, nos termos |
| Comunicar incidente | compromisso em `/privacidade` |
