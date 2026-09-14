# LGPD — o que o RumoFácil faz, e o que falta

**Status:** Implementado em 12/09/2026. Falta rodar a migração 008 e
configurar três variáveis (§7) antes de subir.
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
nos textos = subir a versão.**

**Quem já tinha conta é avisado** (13/09/2026): se `terms_version` do perfil
é diferente da atual, uma faixa aparece no topo do painel com os links e o
botão "Li e aceito". Quem grava é `/api/termos/aceitar`, com a chave
secreta — as colunas de aceite ficam fora dos grants de quem está logado
(§7), pra ninguém registrar aceite de versão que não leu. A faixa avisa, não
bloqueia: travar o app seria transformar informação em barreira.

**Contas anteriores à migração 008** (Talles e Duda) nasceram com as colunas
nulas — e caem na mesma faixa de aceite, com o texto "sua conta é anterior
aos nossos termos".

## 2b. Cookies

Só o necessário: o cookie de sessão do Supabase e três preferências no
`localStorage` (escopo, ocultar valores, e se a barra de aviso já foi
fechada). Nenhum rastreador, nenhuma medição de audiência — conferido no
código.

**Por isso não existe "aceitar cookies".** A LGPD e a orientação da ANPD
dispensam consentimento para cookie estritamente necessário; pedir permissão
para algo que a pessoa não pode recusar e seguir usando seria consentimento
de mentira. O que a lei exige é transparência: há uma seção própria em
`/privacidade` e uma barra informativa (`AvisoCookies.tsx`) que aparece uma
vez e some ao ser fechada.

**Se um dia entrar cookie não necessário** (analytics, por exemplo), aí sim
precisa de pedido de permissão recusável, antes de gravar qualquer coisa.

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

## 5. Baixar meus dados

Ajustes → Baixar meus dados. Direito de portabilidade (art. 18, V).

- **Planilha (CSV):** gastos, rendas e investimentos numa tabela só, com
  coluna `tipo`. Abre direto no Excel brasileiro (`;`, vírgula decimal,
  UTF-8 com BOM) e **a tela de importar lê de volta sem ajuste** — os nomes
  das colunas são os que ela reconhece.
- **Tudo (JSON):** perfil (com as datas de aceite e consentimento), casa,
  lançamentos, cartões, categorias, contas e importações.

**Só o que é da pessoa.** Os lançamentos das outras pessoas da casa ela vê
no app, mas não são dela pra levar: pôr dado de terceiro num arquivo de
portabilidade seria o contrário do que a lei protege. Da casa, vão só nome e
cor — quem mais está nela também é dado das outras pessoas.

Texto começando com `=`, `+`, `-` ou `@` sai com um `'` na frente, senão o
Excel executa como fórmula (injeção de CSV). A importação tira o `'` na volta.

## 6. Consentimento para recibos

Coluna `receipts_consent_at` (migração 008). Recibo pode conter dado de
saúde (art. 11), então o consentimento precisa ser **específico e livre**:

- **No cadastro:** caixa separada do aceite dos termos, **desmarcada e
  opcional**. Se marcar fosse obrigatório pra criar conta, o consentimento
  não seria livre.
- **Em Ajustes → Recibos:** dar ou retirar a qualquer momento.
- **Na hora do primeiro recibo:** se a pessoa não consentiu, anexar
  pergunta antes (`FASE_E.md` §3.6). O servidor confere de novo antes de
  aceitar o envio.

**Retirar apaga os recibos guardados**, na hora — arquivos no R2 e linhas.
Ajustes diz quantos são antes de confirmar.

## 7. Correção de segurança (migração 008, parte 3)

Encontrada em 12/09/2026, ao revisar o que a pessoa pode alterar no próprio
perfil pra gravar o consentimento. A política `profiles_update_own` só
conferia "o perfil é seu?", **sem restringir coluna**. Resultado: quem
estava logado podia mudar o próprio `household_id` direto pela API e entrar
em qualquer casa cujo id conhecesse — sem convite, furando o limite de 6, e
passando a ver os lançamentos dela. O caso realista é quem saiu de uma casa
e guardou o id. Conferido no banco: `has_column_privilege` dava verdadeiro,
e não havia trigger barrando.

**Nada indica que tenha sido usado** — o app nunca faz isso e só existem
contas conhecidas — mas com cadastro público era questão de tempo.

A correção é **privilégio por coluna**, que o Postgres confere antes da RLS:
quem está logado só altera o que o app altera de fato (conferido tela a
tela). Em `profiles`: nome, cor, cartão do mês e consentimento de recibos.
Em `households`: nome e cor. Em `household_invites`: só o status (revogar).
O resto muda apenas por funções `security definer` que validam — aceitar
convite, sair da casa, cadastro.

**Cuidado futuro:** coluna nova editável pela tela precisa entrar nos
grants da 008. Se esquecer, o sintoma é "permission denied" — falha visível,
não brecha.

## 8. O que precisa de você

1. **Rodar a migração 008** (SQL na conversa / `supabase/migrations/`).
2. **Na Vercel**, três variáveis:
   - `SUPABASE_SECRET_KEY` — a chave **secreta** (`sb_secret_...`), em
     Project Settings → API Keys. **Sem `NEXT_PUBLIC_`.** Ela ignora RLS:
     vazar essa chave é entregar o banco inteiro.
   - `NEXT_PUBLIC_RESPONSAVEL_NOME` — quem responde pelo app.
   - `NEXT_PUBLIC_CONTATO_EMAIL` — de preferência um e-mail do app, não o
     pessoal.
3. Os mesmos três no `.env.local` para testar local.

## 9. O que ainda falta

Em ordem de importância:

- **Revisão profissional dos textos** antes de divulgar amplamente.
- **SMTP próprio** — pendente desde a Fase B; sem ele, "esqueci minha senha"
  e cadastro dependem de um remetente que manda poucos e-mails por hora.

## 10. O que a LGPD pede e já está coberto

| Exigência | Onde |
| --- | --- |
| Identificar o controlador e um contato | `/privacidade` (via variáveis) |
| Informar o que coleta e para quê | `/privacidade` |
| Base legal | execução de contrato; consentimento separado e opcional pro recibo |
| Revogar consentimento | Ajustes → Recibos |
| Cookies | só necessários; seção própria em `/privacidade` e aviso no app |
| Informar transferência internacional | `/privacidade` — Groq, Cloudflare |
| Dado sensível (saúde em recibo) | consentimento específico, conferido no servidor; retirar apaga |
| Informar com quem compartilha | `/privacidade` — casa e provedores |
| Minimização | data de nascimento não é guardada |
| Direito de exclusão | Ajustes → Excluir conta |
| Direito de correção | editar perfil e qualquer lançamento |
| Direito de acesso e portabilidade | Ajustes → Baixar meus dados (CSV e JSON) |
| Segurança | RLS no banco, privilégio por coluna, chaves só no servidor, senha cifrada |
| Menores | 18+ declarado no cadastro, nos termos |
| Comunicar incidente | compromisso em `/privacidade` |
