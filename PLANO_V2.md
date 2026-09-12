# Plano — Finanças do Casal v2: de app do casal a produto multiusuário

**Status:** Rascunho para discussão. Nada aqui foi implementado ainda.
**Como usar este documento:** cada fase tem "o que muda", "o que precisa existir
antes", "decisões que só você pode tomar" e "riscos". Leia as decisões antes de
aprovar a fase — inverter uma depois que o código já existe custa caro.

---

## 0. O que este pedido realmente é

Você pediu cinco coisas na mesma mensagem. Elas não têm o mesmo tamanho nem a
mesma natureza:

| Pedido | Natureza |
| --- | --- |
| Ver "pelo cartão" na página inicial | Já existe no código, só falta subir |
| Login público, qualquer um cria conta | Muda o modelo de segurança do zero |
| Convite para juntar duas contas numa casa | Feature nova, schema novo |
| Lançar gasto por áudio | Feature nova, depende de IA externa |
| Foto de recibo guardada para imposto de renda | Feature nova, storage externo + IA |

Os itens 2 a 5 têm uma dependência entre si que muda a ordem de construção:
**abrir cadastro (2) tem que vir antes de tudo**, porque convite (3) só faz
sentido se existir gente de fora para convidar, e a conta de quem usa
áudio/foto (4, 5) precisa existir antes de gastar cota de IA com ela.

Este plano segue nessa ordem: **Fase A** (já pronta, só falta publicar) →
**Fase B** (abrir cadastro) → **Fase C** (convite/casa) → **Fase D** (áudio) →
**Fase E** (foto + guarda fiscal). Cada fase é utilizável sozinha — dá para
parar depois de qualquer uma e o app continua inteiro.

---

## Fase A — Publicar o que já está pronto

**O que é:** o toggle "Mês / Pelo [cartão]" na página inicial, com os quatro
números (entrou/saiu/investiu/sobrou) recalculados pela janela do cartão em
vez do calendário. Isso já foi escrito na sessão anterior e está commitado
localmente, só não foi enviado.

**Por que ainda não está no ar:** a migração `003_janela_completa.sql` não foi
rodada no Supabase (confirmei agora — a função `expenses_in_window` não existe
no banco). Sem ela, a tela quebraria em produção.

**O que fazer:** rodar a migração pendente e eu dou o push. Isso não faz parte
do resto deste plano — é só destravar o que já existe. Vou tratar como
prioridade separada, fora das fases abaixo.

---

## Fase B — Abrir o cadastro

> **A partir daqui, a especificação de verdade é `FASE_B.md`.** Este resumo
> ficou desatualizado assim que as três decisões abaixo foram fechadas —
> ainda descreve o binário `accent: 'a'|'b'` antigo, e não tem SQL nem código
> real. Mantido só pelo contexto histórico de por que a fase existe; para
> implementar, o `FASE_B.md` é quem manda.

### O que muda (contexto original, ver nota acima)

Hoje: duas contas fixas, criadas manualmente no painel do Supabase, ligadas a
uma casa por um `seed.sql` que você edita e roda à mão. Cadastro público está
**desligado** de propósito (é a primeira instrução do `INSTRUCOES.md`).

Depois: qualquer pessoa cria a própria conta pela tela de login, sem ninguém
mexer no painel do Supabase.

### O que precisa existir antes de ligar isso

1. **Confirmação de e-mail.** Com cadastro público, sem confirmação de e-mail
   qualquer um cria conta com e-mail de qualquer um. O Supabase já tem esse
   fluxo pronto (é a opção que está desligada hoje em "Confirm email") — é
   ligar, não construir.
2. **Criação automática de perfil.** Hoje o `seed.sql` cria a linha em
   `profiles` na mão. Com gente entrando sozinha, precisa de um gatilho no
   banco: toda vez que alguém confirma o cadastro em `auth.users`, uma linha
   nasce em `profiles` sozinha, com `household_id` **nulo** e uma **casa
   própria criada na hora** (cada pessoa começa como "casa de uma pessoa só"
   até convidar alguém — ver Fase C). Sem isso, a tela vai continuar mostrando
   "Falta vincular seu perfil" para todo mundo que se cadastrar.
3. **Página de cadastro.** A tela de `/entrar` hoje só tem login. Precisa
   ganhar "Criar conta" (nome, e-mail, senha) e uma tela de "confira seu
   e-mail" depois de cadastrar.

### O que a RLS já resolve sozinha

Boa notícia: a `household_member_ids()` e as políticas de leitura/escrita já
são genéricas — elas não têm o UUID de vocês dois escritos em lugar nenhum,
filtram por `household_id` de quem está logado. Abrir cadastro **não exige
reescrever nenhuma política**. O modelo de dados já foi desenhado certo para
isso, mesmo tendo sido pensado para dois.

### Decisões que só você toma

- **Nome do produto.** "Finanças do casal" deixa de fazer sentido como nome de
  produto público — vira nome de conceito, não de marca. Precisa de um nome.
- **Domínio próprio ou continuar em `.vercel.app`?** Para um produto que
  estranhos vão usar, um domínio custa pouco e passa confiança.
- **Cobrar ou não.** Groq e Cloudflare R2 têm camada grátis generosa, mas ela é
  **compartilhada entre todo mundo que usar o app**, não por pessoa. Se o app
  crescer, a conta é sua. Vale decidir agora se em algum momento os recursos de
  IA/foto ficam limitados por usuário (ex: 20 lançamentos por áudio por mês no
  plano grátis) — constrói-se mais barato se essa regra existir desde o início
  do que se for enxertada depois.

### Riscos

- **Spam de cadastro.** App público na internet atrai bot. Confirmação de
  e-mail resolve a maior parte; se não bastar, o Supabase tem CAPTCHA nativo
  (hCaptcha/Turnstile) para ligar depois, sem mudar nada do seu código.
- **Cada pessoa nova é uma "casa" vazia.** Isso é esperado e correto: o
  convite (Fase C) é o que junta duas casas em uma.

---

## Fase C — Convite para formar casal

> **Superado. A especificação de verdade é `FASE_C.md` — implementada e no ar em 11/09/2026.** Duas coisas abaixo
> estão erradas: (1) a casa tem **até 6 pessoas**, decisão de 10/09/2026, não
> duas; (2) a regra de "só aceita convite se a casa não tiver lançamentos" era
> medo infundado — nenhuma tabela de dado tem `household_id`, tudo é por
> `user_id`, então mudar de casa é trocar um campo no perfil e o histórico
> vem junto. Mantido só como registro de como se pensava antes.

### O que muda (contexto original, ver nota acima)

Hoje a "casa" nasce pronta via `seed.sql`. Com cadastro aberto, cada pessoa
começa sozinha (Fase B). Esta fase é o que deixa duas pessoas virarem
"Talles + Duda" sem ninguém tocar no banco.

### Desenho proposto

**Uma casa tem no máximo duas pessoas.** Não é limitação técnica — é decisão
de manter o design atual, que já tem cor A/cor B e o `ScopeToggle` com
exatamente duas opções (`me` / `us`). Suportar três ou mais exigiria redesenhar
cor, toggle e a ideia de "escopo" inteira. Recomendo manter em duas; se um dia
precisar de mais, é conversa nova.

**Fluxo:**
1. Você abre "Ajustes → Convidar", digita o e-mail da Duda.
2. Isso cria uma linha em `household_invites` (e-mail convidado, quem convidou,
   status `pendente`, prazo de validade — 7 dias, por exemplo).
3. A Duda recebe um e-mail (o Supabase já dispara e-mail transacional; para
   convite customizado, ou usamos a mesma infra de auth de forma criativa, ou
   um serviço de e-mail simples — Resend tem camada grátis de 100 e-mails/dia,
   suficiente aqui).
4. Duda abre o link, faz login (ou cria conta, se ainda não tiver), e vê "Talles
   te convidou para juntar as finanças — aceitar?".
5. Ao aceitar: **a casa da Duda é apagada e ela migra para a casa do Talles**
   (só se a casa dela não tiver dado nenhum — ver regra abaixo), virando pessoa
   B.

**Regra de proteção:** só é possível aceitar um convite se sua casa atual
**não tiver nenhum lançamento** (nem gasto, nem renda, nem investimento). Isso
evita o problema difícil de "e se os dois já tinham dado antes de se
conhecerem — como junta sem duplicar ou perder?". Se a pessoa convidada já usa
o app sozinha há tempo, ela vê um aviso claro: *"Você já tem lançamentos. Para
aceitar este convite, fale com quem te convidou — vocês vão precisar decidir
o que fazer com seu histórico."* (Migração de dados entre casas fica fora
deste plano — é native decisão de produto, não technical, e provavelmente
nunca vale a pena automatizar para um caso raro.)

### O que precisa no banco (visão geral, sem SQL final ainda)

- Tabela `household_invites`: quem convidou, e-mail convidado, status, prazo.
- Uma função seguro (`security definer`) para aceitar convite, que:
  confere que quem está aceitando é dona do e-mail convidado, confere que a
  casa dela está vazia, e só então atualiza `household_id` e `accent`.
- RLS na tabela de convites: você vê convites que mandou; a pessoa convidada
  vê convites com o e-mail dela (isso exige comparar com `auth.users.email`,
  que não é exposto por padrão — precisa de uma função auxiliar, no mesmo
  espírito de `my_household_id()`).

### Decisões que só você toma

- **O que acontece com o convite recusado ou vencido?** Proponho: só some da
  lista, sem aviso para quem convidou. Simples, mas dá para mudar.
- **Dá para desfazer a união depois?** Separar duas contas que já viraram
  "casa" é mais raro e mais delicado (o que acontece com os lançamentos de
  cada um?). Sugiro deixar de fora da v2 e resolver manualmente pelo SQL
  Editor se algum dia for preciso — não vale o esforço de construir uma tela
  para algo raro e de alto risco.

---

## Fase D — Lançar gasto por áudio

### O fluxo

1. Botão de microfone (em `/gastos`, ao lado de "Novo gasto").
2. Grava a voz no navegador (a Web API `MediaRecorder` faz isso; funciona no
   PWA instalado, no Chrome e no Safari modernos).
3. O áudio sobe para uma rota do próprio servidor Next.js (nunca direto para
   um provedor de IA a partir do navegador — a chave da API não pode aparecer
   no código do cliente).
4. O servidor manda o áudio para **transcrição** (Groq tem um modelo Whisper
   na camada grátis, rápido e sem custo até um limite generoso de uso).
5. O texto transcrito vai para um **segundo passo de interpretação**: outra
   chamada de IA (a mesma Groq serve modelos de texto rápidos e grátis) que
   tenta extrair `{ descrição, valor, categoria sugerida, forma de pagamento
   sugerida }` a partir da frase.
6. **O formulário de gasto abre pré-preenchido com isso — e para aí.** Ninguém
   salva sozinho. Você confere, ajusta o que a IA errou, e aperta "Salvar
   gasto" do jeito que já funciona hoje.

### Por que o passo 6 não é negociável

IA erra valor e categoria com frequência normal — não é bug, é a natureza da
ferramenta. Bug é ela errar. Deixar o áudio confirmar sozinho **sem revisão**
seria a única forma de este app estragar dado financeiro de verdade sem você
perceber. O modelo de confirmação manual que já existe no app (nenhum
formulário salva sem clique) se estende para cá sem exceção.

### O que precisa de você

- **Uma conta na Groq** (console.groq.com) e uma chave de API — gratuita para
  o volume que dois usuários (ou algumas dezenas) vão gerar. Isso vai numa
  variável de ambiente **só de servidor** (sem `NEXT_PUBLIC_`, então nunca
  aparece no navegador) — mesmo padrão de cuidado que já usamos com a chave do
  Supabase.

### Decisões que só você toma

- **Duração máxima do áudio.** Sem limite, um áudio de 3 minutos custa
  proporcionalmente mais e demora mais para processar. Sugiro 30 segundos —
  dá para descrever um gasto inteiro sobrando tempo.
- **O que fazer quando a IA não consegue extrair nada de útil** (áudio
  inaudível, ruído, pessoa mudou de assunto no meio)? Proponho: abre o
  formulário vazio com um aviso, em vez de travar a tela.

### Riscos

- **Camada grátis é para o app inteiro, não por pessoa.** Se muita gente usar
  ao mesmo tempo, o limite de requisições por minuto da Groq pode ser
  atingido — nesse caso a chamada falha e a pessoa vê "não deu para entender o
  áudio, tente digitar" em vez de travar. Isso é factível de tratar bem desde
  o início.
- **Nomes de modelo mudam.** Provedores de IA trocam e aposentam modelos com
  frequência maior que bibliotecas normais. Vou isolar a chamada de IA atrás
  de uma função só (`transcrever()`, `interpretarGasto()`), para trocar de
  modelo — ou até de provedor — sem tocar no resto do app.

---

## Fase E — Foto de recibo + guarda para imposto de renda

> **A especificação de verdade é `FASE_E.md`** (escrita em 12/09/2026).
> O resumo abaixo é o contexto original de por que a fase existe; o que
> mudou desde então: a fase foi dividida em E1 (anexar e guardar) e E2
> (ler com IA), porque as duas têm riscos diferentes e a primeira entrega
> sozinha.

### O que é, com precisão

Você descreveu duas coisas que parecem uma só mas são independentes:

1. **Ler o recibo com IA** (OCR + extração), para ajudar a preencher o
   formulário de gasto — mesmo princípio do áudio: sugestão, nunca gravação
   automática.
2. **Guardar a foto original para sempre**, ligada ao lançamento, para quando
   a Declaração de Imposto de Renda pedir comprovante.

O item 2 é o que muda a arquitetura: ele exige um **lugar para guardar
arquivo**, que o app não tem hoje (o Supabase Storage existiria como opção
mais simples, mas você especificamente pediu Cloudflare R2 pelo free tier de
10GB, que é bem maior que o do Supabase Storage gratuito — decisão razoável).

### O fluxo

1. Na tela de gasto, botão "Anexar recibo" (câmera ou galeria).
2. A foto sobe **direto do navegador para o Cloudflare R2**, sem passar pelo
   servidor Vercel no meio — usando uma "URL assinada temporária" que o
   servidor gera na hora (o servidor nunca vê o arquivo, só autoriza o
   envio). Isso importa porque a Vercel tem limite de tamanho de upload nas
   funções de servidor; contornar isso desde o início evita ter que refazer
   depois que alguém tirar foto de um recibo grande.
3. Depois de enviada, opcionalmente a mesma foto passa pelo passo de leitura
   por IA (modelo com visão, também pela Groq) para sugerir descrição e valor.
4. O recibo fica listado no lançamento de gasto — uma miniatura, com opção de
   baixar o original.
5. Uma tela nova, **"Recibos"** ou dentro de Relatórios, lista todos os
   recibos guardados no ano, com filtro por mês — pensada para ser aberta uma
   vez por ano, na época de declarar o imposto, e baixar tudo.

### O que precisa no banco

- Tabela `receipts`: dono, gasto ligado (opcional — um recibo pode existir
  antes do gasto ser salvo), chave do arquivo no R2, tipo do arquivo, data.
- **Privacidade igual a cartão**: recibo é prova de gasto de uma pessoa só.
  Só o dono vê e baixa o próprio recibo, mesmo na visão do casal — mesma regra
  que já existe para `cards` e `bank_accounts`.

### O que precisa de você

- **Uma conta Cloudflare**, um bucket R2 criado, e um token de API com
  permissão só naquele bucket (nunca a chave mestra da conta inteira).
  Isso é uma configuração externa, do mesmo tipo que você já fez para o
  Supabase e para a Vercel — eu escrevo o passo a passo quando chegarmos
  nesta fase, mas quem cria a conta e clica é você.

### Decisões que só você toma

- **Por quanto tempo guardar?** A Receita Federal pede guarda de comprovantes
  por 5 anos. 10 GB grátis, com foto de celular comprimida (200–500 KB cada),
  dá para milhares de recibos — não é urgente decidir um limite agora, mas
  vale ter em mente que "guardar para sempre" tem uma parede ao final, só que
  bem longe.
- **A leitura por IA da foto é obrigatória ou o anexo funciona mesmo sem
  ela?** Recomendo: o anexo (guardar a foto) funciona sempre, mesmo se a
  leitura por IA falhar ou estiver fora do ar. Guardar o comprovante é o valor
  real; a sugestão automática é conveniência.

### Riscos

- **Custo além do free tier.** R2 cobra por armazenamento acima de 10 GB e por
  operações de leitura/escrita acima de um número generoso mensal — muito
  difícil de estourar com uso de duas pessoas, mas se o app virar público
  (Fase B), o uso agregado de todo mundo conta junto. Vale revisar o
  faturamento do Cloudflare de vez em quando depois de abrir ao público.

---

## Ordem recomendada e por quê

```
Fase A (destravar o que já existe) — dias, não semanas
Fase B (abrir cadastro)             — base de tudo que vem depois
Fase C (convite/casal)              — depende de B existir
Fase D (áudio)                      — independente de C, mas mais value depois de B
Fase E (foto + fiscal)              — a mais cara em infraestrutura nova; a última
```

D e E podem trocar de ordem entre si sem problema — nenhuma depende da outra.
C pode andar em paralelo com D/E depois que B estiver pronta. A única ordem
rígida é **A antes de tudo**, e **B antes de C**.

---

## Decisões — resolvidas em 10/09/2026

1. **Cadastro público, com confirmação por e-mail.** A opção "Enable sign ups"
   do Supabase, hoje desligada, vai ser ligada. "Confirm email" fica ligado
   junto, para não abrir a porta para qualquer e-mail sem dono.
2. **Cor por pessoa, escolhida livremente — não mais o binário fixo a/b.**
   `profiles.accent` (`'a' | 'b'`) é substituído por `profiles.color` (hex
   livre, mesma paleta de categorias e cartões). Cada pessoa escolhe a
   própria cor no cadastro ou depois, em Ajustes.
   **Nota de escopo:** isso resolve *identidade visual por pessoa*. Não
   decide sozinho quantas pessoas cabem numa casa — essa pergunta segue em
   aberto para a Fase C, tratada separadamente quando chegarmos lá.
3. **Nome do produto: RumoFácil**, provisório (ainda não fechado com a Duda).
   Renomear os artefatos visíveis (título da página, nome do PWA, README) fica
   dentro do trabalho da Fase B — vem junto quando o cadastro abrir para
   estranhos, não antes.

**Fase B implementada em 10/09/2026** — ver `FASE_B.md` para o que mudou
arquivo por arquivo. Falta só rodar a migração 004 e ligar o cadastro no
painel (passos 1 e 2 da ordem de execução lá).
