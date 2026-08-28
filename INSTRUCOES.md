# INSTRUÇÕES — Finanças do casal

Documento de continuidade. Serve tanto pra você seguir o passo a passo quanto
pra dar contexto ao Claude no VSCode/Cowork sobre o que já existe e o que falta.

---

## Parte 1 — Setup (fazer antes de mexer em código)

### 1.1 Supabase

1. Crie um projeto novo em **supabase.com** (região São Paulo, é a mais perto).
2. **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → Run.
   Espere terminar sem erro antes de seguir.
3. **Authentication → Users → Add user**, duas vezes:
   - seu e-mail + senha, com **Auto Confirm User** marcado
   - o e-mail dela + senha, também com Auto Confirm marcado
4. **Authentication → Sign In / Providers → Email** → desligue **Enable sign ups**.
   Sem isso qualquer um que achar a URL consegue criar conta.
5. Abra `supabase/seed.sql`, troque as 4 variáveis do topo:
   ```sql
   email_a text := 'seu@email.com';
   email_b text := 'email@dela.com';
   nome_a  text := 'Talles';
   nome_b  text := 'Nome dela';
   ```
   Cole no **SQL Editor** → Run. Deve aparecer `NOTICE: Casa criada: <uuid>`.

### 1.2 Projeto local

```powershell
npm install
Copy-Item .env.local.example .env.local
```

Abra `.env.local` e preencha com **Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

```powershell
npm run dev
```

### 1.3 Teste de fumaça

Abra `http://localhost:3000`. O esperado:

- redireciona pra `/entrar`
- login com o seu e-mail funciona
- o toggle no topo mostra **"Talles"** e **"Talles + Nome dela"**
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

Funções disponíveis (todas respeitam RLS, todas retornam `user_id` pra você
filtrar por escopo no cliente):

| Função                    | Retorna                                             |
| ------------------------- | --------------------------------------------------- |
| `expense_occurrences`     | cada gasto expandido por mês, com nº da parcela      |
| `income_occurrences`      | cada renda expandida por mês                         |
| `investment_occurrences`  | cada aporte expandido por mês                        |
| `monthly_summary`         | entrada / saída / investimento por mês e por pessoa  |
| `category_ranking`        | total por nome de categoria, já ordenado             |

`category_ranking` agrupa pelo **nome** da categoria e devolve o `user_id`, para
o cliente filtrar por escopo antes de somar. Como cada um tem a própria lista,
categorias com nome igual nas duas contas somam na visão do casal — a soma
acontece depois do filtro, em `/relatorios`.

### Privacidade dentro da casa

| Tabela        | Leitura      | Escrita |
| ------------- | ------------ | ------- |
| `cards`       | só o dono    | o dono  |
| `categories`  | a casa toda  | o dono  |
| `incomes`     | a casa toda  | o dono  |
| `expenses`    | a casa toda  | o dono  |
| `investments` | a casa toda  | o dono  |

Categorias são legíveis pela casa porque o ranking do casal precisa do nome
delas. Mas **nos formulários, só mostre as categorias e cartões do usuário
logado** (`.eq("user_id", me.id)`), nunca `userIds`.

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

- Schema completo com RLS e as 5 funções de relatório
- Seed que cria a casa e vincula os dois perfis
- Auth por cookie (`@supabase/ssr`) + middleware que protege todas as rotas
- `ScopeProvider`, `ScopeToggle`, `ScopeHeading`
- Shell do app: nav responsiva, header com toggle, botão de sair
- PWA: manifest, service worker, ícones
- Helpers de formatação pt-BR e tipos do domínio
- Kit de interface compartilhado (`src/components/ui.tsx`): campos, botões,
  folha de formulário, seletor de cor, navegação de mês, confirmação de exclusão
- Gráficos (`src/components/charts.tsx`): barras mensais com legenda e tooltip
- **Todas as telas das Fases 2, 3 e 4** — cartões, categorias, gastos, renda,
  investimentos, dashboard e relatórios

---

## Parte 4 — Telas entregues

### Fase 2 — Cadastros base

- [x] `/cartoes` — CRUD. Nome, dia de fechamento, dia de vencimento, cor.
      Cartão com gasto ligado só arquiva; sem gasto, exclui. Arquivados ficam
      numa seção à parte, com "Reativar".
- [x] `/categorias` — CRUD com a mesma regra de arquivar. A cor sai de uma
      paleta de 10 opções (`src/lib/palette.ts`) e a tela sugere uma cor ainda
      não usada. Nome repetido devolve recado em português, não erro do banco.

### Fase 3 — Lançamentos

- [x] `/gastos` — lista vinda de `expense_occurrences` do mês selecionado, com
      filtros de mês, forma de pagamento, tipo, categoria e cartão. Formulário
      com campos condicionais: `card` exige cartão, `fixed_installment` exige
      número de parcelas e mostra a prévia ("10x de R$ 120,00 — R$ 1.200,00 no
      total, termina em Maio 2027"). Editar e excluir só aparecem no que é seu.
- [x] `/renda` — CRUD com fonte, valor, tipo, início e fim opcional, mais o
      total que entra por mês hoje.
- [x] `/investimentos` — CRUD com nome, tipo de ativo, valor, aporte único ou
      mensal, início e fim opcional, mais o aporte mensal em vigor.

### Fase 4 — Visualização

- [x] `/` dashboard — mês corrente (ou o mês escolhido na navegação), sempre no
      escopo ativo: entrou / saiu / investiu / sobrou, barras dos últimos 6
      meses, top 5 categorias com % do gasto e a lista dos fixos do mês.
- [x] `/relatorios` — seletor de ano, gráfico dos 12 meses com entrada, saída e
      investimento na mesma escala, médias por mês com movimento, ranking
      completo por categoria com % do total, e a tabela do ano mês a mês.
      Na visão do casal os totais vêm somados, sem quebra por pessoa.

### Extra que a navegação pediu

- [x] `/ajustes` — no celular a barra de baixo é só para o dia a dia, então
      Cartões e Categorias ganharam esta página de entrada, ligada no header.
      No desktop eles continuam na coluna lateral.

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
- Não commite `.env.local` (já está no `.gitignore`).

---

## Prompt sugerido pro Cowork

> Este é um PWA de finanças para um casal, Next.js 15 + Supabase.
> Leia `INSTRUCOES.md` inteiro antes de escrever qualquer código — ele explica
> o modelo de escopo (individual vs casal), como gastos recorrentes e parcelados
> são gravados, e as regras de design. Depois disso, comece pela Fase 2.
