# Finanças do casal

PWA de controle financeiro para duas pessoas. Cada um lança o que é seu; os dois
enxergam o total. Next.js + Supabase.

## Como o dado é organizado

Uma **casa** (`households`) contém dois **perfis** (`profiles`). Toda linha de
renda, gasto e investimento pertence a um `user_id`.

- **Minha visão** filtra por `user_id = eu`
- **Visão do casal** filtra por `user_id in (nós dois)`

A RLS libera **leitura** para a casa toda e **escrita** só nos próprios
registros. Cartões são a exceção: leitura também é privada, então você não vê os
cartões da outra pessoa nem por engano.

## Gastos fixos e parcelados

Um gasto fixo é gravado **uma vez só**, não uma linha por mês:

| kind                | o que é                | campos                              |
| ------------------- | ---------------------- | ----------------------------------- |
| `variable`          | avulso                 | `start_date` é a data do gasto      |
| `fixed_recurring`   | mensalidade            | `end_date` nulo = sem fim previsto  |
| `fixed_installment` | parcelado              | `installments_total`, fim calculado |

As funções `expense_occurrences`, `income_occurrences` e
`investment_occurrences` projetam essas linhas nos meses em que elas acontecem.
Editar ou apagar um fixo mexe em um registro só.

## Configurar

### 1. Supabase

1. Crie um projeto novo em supabase.com
2. SQL Editor → cole e rode `supabase/schema.sql`
3. Authentication → Users → **Add user** duas vezes (marque *Auto Confirm User*)
4. Authentication → Providers → Email → **desligue** "Enable sign ups"
   (só vocês dois entram, ninguém se cadastra sozinho)
5. SQL Editor → abra `supabase/seed.sql`, troque os dois e-mails e nomes pelos
   de vocês, e rode

### 2. App

```bash
npm install
cp .env.local.example .env.local   # preencha com a URL e a anon key do projeto
npm run dev
```

As chaves ficam em Supabase → Project Settings → API.

### 3. Instalar no celular

Depois do deploy (Vercel), abra o site no celular e use "Adicionar à tela de
início". O service worker só registra em produção.

## Estrutura

```
supabase/
  schema.sql     tabelas, RLS e funções de relatório
  seed.sql       cria a casa e liga os dois perfis
src/
  app/
    entrar/      login
    (painel)/    tudo que exige sessão
  components/    ScopeProvider é o coração: define de quem são os números
  lib/
    supabase/    clientes de browser, server e middleware
    format.ts    moeda e datas em pt-BR
    types.ts     tipos do domínio
```
