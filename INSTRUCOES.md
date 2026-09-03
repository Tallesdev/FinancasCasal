# INSTRUÇÕES — Finanças do casal

Documento de continuidade. Serve tanto pra você seguir o passo a passo quanto
pra dar contexto ao Claude no VSCode/Cowork sobre o que já existe e o que falta.

> **Leia o `PRD.md` primeiro.** Ele diz *o que* o app é e *por que* cada decisão
> foi tomada — personas, requisitos, regras de negócio, estados de tela, o que
> ficou de fora e por quê. Este arquivo aqui é o *como*: arquitetura, convenções
> de código e a ordem de implementação. Sem o PRD, dá pra construir a coisa
> certa do jeito errado, ou a coisa errada do jeito certo.

---

## Parte 1 — Setup

### 1.1 Supabase

1. Crie um projeto novo em **supabase.com** (região São Paulo, é a mais perto).
2. **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → Run.
   Espere terminar sem erro antes de seguir.
3. **Authentication → Users → Add user**, duas vezes:
   - seu e-mail + senha, com **Auto Confirm User** marcado
   - o e-mail dela + senha, também com Auto Confirm marcado
4. **Authentication → Sign In / Providers → Email** → desligue **Enable sign ups**.
   Sem isso qualquer um que achar a URL consegue criar conta.
5. Abra `supabase/seed.sql`, troque as 4 variáveis do topo pelos e-mails e nomes
   de vocês, cole no **SQL Editor** → Run. Deve aparecer
   `NOTICE: Casa criada: <uuid>`.

> **Num banco que já tem dados, nunca rode o `seed.sql` de novo** — ele cria uma
> casa nova a cada execução. Mudanças de estrutura entram por
> `supabase/migrations/`, que são aditivas e podem rodar mais de uma vez sem
> estragar nada.

### 1.2 Projeto local

```powershell
npm install
Copy-Item .env.local.example .env.local
```

Abra `.env.local` e preencha com **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

A chave é a **publishable** (a antiga `anon` também funciona — é a mesma coisa
com nome novo). Nunca a `service_role`: ela ignora RLS e não pode ir pro
navegador.

```powershell
npm run dev
```

### 1.3 Teste de fumaça

Abra `http://localhost:3000`. O esperado:

- redireciona pra `/entrar`
- login com o seu e-mail funciona
- o toggle no topo mostra **"Talles"** e **"Talles + Duda"**
- alternar entre os dois muda a cor de destaque da interface

Se aparecer *"Falta vincular seu perfil"*, o `seed.sql` não rodou ou os e-mails
não bateram com os do Authentication.

---

## Parte 2 — Contexto do projeto (leia antes de programar)

### O que o app é

PWA de finanças para **duas pessoas**. Cada um lança o que é seu e tem o próprio
relatório. Existe também uma visão combinada com os números dos dois somados.

Sem roles, sem hierarquia. As duas contas têm exatamente os mesmos poderes.

### Stack

Next.js 15 (App Router) · Supabase (Auth + Postgres + RLS) · Tailwind 4 ·
Recharts · TypeScript.

### O conceito central: escopo

Tudo gira em torno de `ScopeProvider` (`src/components/ScopeProvider.tsx`).
Ele expõe `userIds`, que é o filtro que **toda consulta de leitura deve usar**:

```ts
const { userIds } = useScope();

const { data } = await supabase
  .from("expenses")
  .select("*")
  .in("user_id", userIds);
```

- escopo `me` → `userIds = [meuId]`
- escopo `us` → `userIds = [meuId, idDela]`

A RLS já impede vazar dados de fora da casa. O `userIds` é o que separa
"minha visão" de "visão do casal" dentro da casa.

**Regra:** nenhuma tela de leitura pode ignorar `userIds`. Já os formulários de
criação **nunca** mandam `user_id` — o `default auth.uid()` do banco resolve.

O relatório por ciclo é a única exceção, e por construção: fatura é de um cartão
específico, cartão é privado, então ali não existe visão de casal.

### Modelo de recorrência (a parte que mais confunde)

Um gasto fixo é gravado **uma linha só**, nunca uma por mês.

| `kind`              | o que é      | como é gravado                          |
| ------------------- | ------------ | --------------------------------------- |
| `variable`          | avulso       | `start_date` é a data do gasto          |
| `fixed_recurring`   | mensalidade  | `end_date` nulo = sem fim previsto      |
| `fixed_installment` | parcelado    | `installments_total`; fim é calculado   |

`amount` é sempre o valor de **uma ocorrência** — o gasto avulso, a mensalidade
ou **a parcela** (não o total do parcelamento).

Para relatórios, nunca leia `expenses` direto. Use as funções que projetam essas
linhas nos meses em que elas caem:

```ts
const { data } = await supabase.rpc("monthly_summary", {
  p_from: "2026-01-01",
  p_to: "2026-12-01",
});
```

| Função                    | Retorna                                             |
| ------------------------- | --------------------------------------------------- |
| `expense_occurrences`     | cada gasto expandido por mês, com nº da parcela      |
| `income_occurrences`      | cada renda expandida por mês                         |
| `investment_occurrences`  | cada aporte expandido por mês                        |
| `monthly_summary`         | entrada / saída / investimento por mês e por pessoa  |
| `category_ranking`        | total por nome de categoria, já ordenado             |

Todas respeitam RLS e devolvem `user_id`, pra você filtrar por escopo no
cliente.

`category_ranking` agrupa pelo **nome** da categoria e devolve o `user_id`, para
o cliente filtrar por escopo antes de somar. Como cada um tem a própria lista,
categorias com nome igual nas duas contas somam na visão do casal — a soma
acontece depois do filtro, em `/relatorios`.

### Ciclo de fatura (mês calendário ≠ fatura do cartão)

O relatório mensal (`monthly_summary`) responde "quanto ganhei/gastei no mês" e
**não muda**. Mas gasto de cartão só vira fatura no fechamento, que raramente
bate com o dia 1º — então existe um segundo relatório, por ciclo, que responde
"quanto vou pagar de fato".

- **O ciclo só tem gasto de cartão.** Pix e transferência saem da conta no dia
  em que acontecem — não esperam fechamento, então não pertencem a fatura
  nenhuma. Ficam no relatório mensal.
- **A fatura é dívida quando fecha, não quando é paga.** Fechou dia 13, o
  dinheiro já está comprometido. O `due_day` é informação de tela e não entra
  em cálculo nenhum.
- **`bank_accounts`** — conta bancária (ex: "Nubank"), privada como cartão.
  Cartão e gasto têm `bank_account_id` opcional. Serve para **separar a origem
  do gasto** na lista, para quem usa mais de uma conta. Não puxa nada para
  dentro de ciclo.
- **`profiles.anchor_card_id`** — o cartão que define o mês da pessoa. Nulo =
  mês do calendário. É o que faz o aviso de fechamento aparecer no dashboard.
- **`card_cycle_bounds(card_id, data_referencia)`** — dado um cartão e uma
  data, devolve a janela do ciclo que contém essa data e a provável data de
  vencimento. Fechamento no dia 13 → uma data em 20/08 cai no ciclo
  14/08–13/09. O próprio dia do fechamento pertence ao ciclo que **termina**
  nele.
- **`cycle_expense_detail(card_id, data_referencia)`** — as compras daquele
  cartão dentro da janela. Diferente de `expense_occurrences`, aqui a data
  importa **por dia**, porque a janela atravessa dois meses do calendário.
- **`cycle_summary`** e **`cycle_category_ranking`** — total e ranking de
  categoria dentro do ciclo.
- **`income_in_window(de, ate)`** — renda projetada **por dia**, para saber
  quanto entrou dentro de uma janela 14→13. `income_occurrences` responde por
  mês e não serve aqui. Devolve `user_id` para filtrar por escopo.

```ts
const { data: bounds } = await supabase.rpc("card_cycle_bounds", {
  p_card_id: cardId,
  p_reference_date: "2026-08-20",
});
// → { cycle_start: "2026-08-14", cycle_end: "2026-09-13", due_date: "2026-09-21" }
```

Pra navegar entre ciclos na tela (anterior/próximo), chame de novo com uma
`p_reference_date` fora da janela atual — um dia antes do `cycle_start` volta
um ciclo, um dia depois do `cycle_end` avança um. É exatamente o que
`/relatorios/ciclo` faz.

Cartão sem `closing_day` devolve **zero linhas** de propósito, e a tela explica
isso apontando pra `/cartoes` em vez de dar erro genérico.

**Ainda não conferido contra fatura real.** A matemática do ciclo é a peça mais
nova e a mais fácil de estar sutilmente errada — fechamento/vencimento em dia
> 28 é aproximado pro último dia do mês em fevereiro, por exemplo. Vale testar
no SQL Editor com o cartão e as datas reais antes de confiar nos números.

### Responsividade — iPhone 13 e telas pequenas

**Todo formulário novo usa os componentes de `src/components/form/Field.tsx`**
(`TextField`, `DateField`, `NumberField`, `SelectField`, `SegmentedField`) em
vez de `<input>` cru. Eles já resolvem dois problemas que, sem isso, se
repetem em cada tela nova:

1. **iOS Safari dá zoom na página inteira** quando o campo focado tem fonte
   menor que 16px. Do lado de quem usa parece que "a tela deu um pulo e
   cobriu o que tinha em cima" — não é bug de posicionamento, é o zoom nativo
   do Safari. `globals.css` trava `font-size: 16px` em todo
   `input`/`select`/`textarea` globalmente, e os componentes de `Field.tsx`
   reforçam isso inline, pra não depender de nenhuma classe do Tailwind
   conseguir sobrescrever sem querer.
2. **Alvo de toque mínimo de 44px** (recomendação da Apple). Todo campo e
   toda opção de `SegmentedField` já nascem com essa altura. As telas mais
   antigas usam a constante `inputClass` de `src/components/ui.tsx`, que
   carrega as mesmas duas garantias.

Use `SegmentedField` pra qualquer escolha de poucas opções (avulso/
recorrente, fixo/variável/parcelado, cartão/pix) em vez de `<select>` — em
tela pequena, tocar direto na opção é mais confiável que abrir um dropdown
nativo.

Instalado como PWA, o app também trava o zoom por gesto: `maximumScale: 1` e
`userScalable: false` no viewport de `src/app/layout.tsx`, mais
`touch-action: manipulation` no `globals.css` (o iOS às vezes ignora o
`user-scalable`, essa regra vale sempre).

**Testar em:** simulador ou DevTools do navegador com largura 375px (iPhone
SE), 390px (iPhone 13, o da Duda) e 360px (Android comum). O simulador do
Safari no macOS reproduz o zoom automático; o DevTools do Chrome não —
então se for testar especificamente esse bug, precisa ser num iPhone de
verdade ou no Simulador do Xcode.

### Privacidade dentro da casa

| Tabela          | Leitura      | Escrita |
| --------------- | ------------ | ------- |
| `cards`         | só o dono    | o dono  |
| `bank_accounts` | só o dono    | o dono  |
| `categories`    | a casa toda  | o dono  |
| `incomes`       | a casa toda  | o dono  |
| `expenses`      | a casa toda  | o dono  |
| `investments`   | a casa toda  | o dono  |

Categorias são legíveis pela casa porque o ranking do casal precisa do nome
delas. Mas **nos formulários, só mostre as categorias, cartões e contas do
usuário logado** (`.eq("user_id", me.id)`), nunca `userIds`.

### Design

Cada pessoa tem uma cor; a visão do casal tem uma terceira. A interface troca de
cor conforme o escopo ativo — dá pra saber de quem são os números sem ler.

| Token                 | Uso                          |
| --------------------- | ---------------------------- |
| `--color-person-a`    | `#7FD1AE` pessoa A           |
| `--color-person-b`    | `#E9A13B` pessoa B           |
| `--color-couple`      | `#C77DFF` visão do casal     |
| `--color-in`          | entrada                      |
| `--color-out`         | saída                        |
| `--color-invest`      | investimento                 |
| `var(--scope)`        | cor do escopo ativo          |

Use `var(--scope)` em vez de cor fixa sempre que o elemento representar
"quem está sendo visto".

Regras que não se quebram:

- Todo valor em dinheiro usa a classe `.money` (mono + `tabular-nums`).
- Formate com `money()` de `src/lib/format.ts`, nunca `toFixed`.
- Mobile-first. A nav é barra inferior no celular, coluna lateral no desktop.
- Copy em português, direta, sem jargão de sistema. Botão diz o que faz
  ("Salvar gasto", não "Enviar").

---

## Parte 3 — O que já está pronto

**Fundação e cadastros**

- Schema completo com RLS e as funções de relatório
- Seed que cria a casa e vincula os dois perfis
- Auth por cookie (`@supabase/ssr`) + middleware que protege todas as rotas
- `ScopeProvider`, `ScopeToggle`, `ScopeHeading`
- Shell do app: nav responsiva, header com toggle, botão de sair
- PWA: manifest, service worker, ícones, zoom por gesto travado
- Helpers de formatação pt-BR e tipos do domínio
- Kit de interface (`src/components/ui.tsx`) e campos de formulário
  (`src/components/form/Field.tsx`)
- Gráficos (`src/components/charts.tsx`): barras mensais com legenda e tooltip

**Telas** — todas no ar:

| Rota                 | O que faz |
| -------------------- | --------- |
| `/`                  | Dashboard do mês: entrou/saiu/investiu/sobrou, barras de 6 meses, top 5 categorias, fixos do mês |
| `/gastos`            | Lista do mês via `expense_occurrences`, filtros, formulário com campos condicionais e prévia do parcelamento |
| `/renda`             | CRUD, mais o total que entra por mês hoje |
| `/investimentos`     | CRUD, mais o aporte mensal em vigor |
| `/relatorios`        | Ano inteiro: gráfico dos 12 meses, médias, ranking por categoria, tabela mensal |
| `/relatorios/ciclo`  | Fatura por ciclo: janela, vencimento, total por forma de pagamento, ranking e lançamentos |
| `/contas`            | CRUD de contas bancárias |
| `/cartoes`           | CRUD de cartões, com a conta que paga a fatura |
| `/categorias`        | CRUD de categorias |
| `/ajustes`           | Índice de contas/cartões/categorias, para o celular |

Fases 1 a 5 do PRD entregues. Falta a Fase 6: usar por um mês inteiro sem
planilha paralela.

---

## Parte 4 — O que falta

### Conferir a matemática do ciclo contra uma fatura de verdade

Já foi conferida contra a regra descrita (fecha 13 → compra do dia 14 em diante
vai pra fatura seguinte, paga dia 21) e contra mês curto (fecha 31 → 28/02 em
fevereiro). **Falta comparar com uma fatura real.** No SQL Editor:

```sql
select * from public.card_cycle_bounds('<uuid-do-cartao>', current_date);
select * from public.cycle_expense_detail('<uuid-do-cartao>', current_date);
```

É a pergunta em aberto nº 4 do PRD.

### Do PRD, ainda não implementado

- **RF24** — criar categoria de dentro do formulário de gasto, sem perder o
  que já foi preenchido.
- **RF29** — duplicar um gasto recente como atalho de lançamento.
- **RF30** — funcionar offline para leitura do mês já carregado.
- **Estado de carregamento** — hoje é uma frase ("Carregando…") onde o PRD pede
  esqueleto no lugar do número.

### Alvo de toque nas ações da lista

Os botões "Editar" e "Excluir" dentro das listas ainda são menores que 44px.
Aumentar a altura deles estoura o layout da linha; o caminho é expandir a área
de toque sem mudar o tamanho visual.

### Depois (só se fizer falta)

Comparativo de contribuição de cada um, metas de gasto por categoria, exportar
CSV, modo claro.

---

## Parte 5 — Notas de ambiente

- **Windows/PowerShell**: sem `touch`, sem brace expansion do bash. Use
  `New-Item` ou o próprio editor pra criar arquivos.
- **Tailwind 4**: sem `tailwind.config.js`. Os tokens ficam no bloco `@theme`
  dentro de `src/app/globals.css`.
- **`cookies()` é async** no Next 15 — por isso `createClient()` do server é
  `async` e precisa de `await`.
- **Service worker só registra em produção**, pra não atrapalhar o hot reload.
- Não commite `.env.local` (já está no `.gitignore`). Os e-mails reais do seed
  ficam em `supabase/seed.local.sql`, também ignorado — o repositório é público.
- **Deploy**: Vercel, ligado no `main` do GitHub. As duas variáveis do
  `.env.local` precisam estar em Environment Variables, nos três ambientes.
  Migração de banco roda **antes** do push, nunca depois.

---

## Prompt sugerido pro Cowork

> Este é um PWA de finanças para um casal, Next.js 15 + Supabase.
>
> Antes de escrever qualquer código, leia dois arquivos, nesta ordem:
> `PRD.md` (o que o produto é, para quem, com quais regras de negócio e estados
> de tela) e `INSTRUCOES.md` (como o código está montado, convenções e o que
> falta fazer).
>
> Antes de codar cada tela, me diga em duas ou três frases o que você entendeu
> que ela precisa resolver, para eu confirmar.

Esse último parágrafo importa. O erro mais comum não é código errado — é o
agente construir uma tela tecnicamente correta que resolve o problema errado.
Pedir o resumo antes de cada tela custa 10 segundos e evita refazer.
