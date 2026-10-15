-- =====================================================================
-- Migração 014 — Recebimentos da empresa (FASE_F.md, F2)
--
-- 1. Recebimento parcelado: "5x de R$ 2.000". Guarda o valor da PARCELA
--    (como o gasto parcelado) e o número de parcelas. Por baixo é um
--    recebimento "todo mês" com fim — assim income_occurrences,
--    monthly_summary e os relatórios já contam cada parcela no seu mês,
--    sem mudar nenhuma função.
-- 2. Cliente: texto opcional no recebimento e no gasto, pra depois somar
--    o lucro de cada cliente (F5.1).
-- 3. income_received: quais parcelas (ou meses) já entraram de verdade.
--    Uma linha por recebimento por mês. Sem linha = ainda a receber.
--    Qualquer pessoa da casa marca: na empresa, quem recebeu o Pix pode
--    não ser quem lançou.
--
-- Nada muda para quem não usa: colunas novas são opcionais e a tabela
-- nova começa vazia.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1 e 2. Colunas novas
-- ---------------------------------------------------------------------
alter table public.incomes
  add column if not exists installments_total int
    check (installments_total between 2 and 120),
  add column if not exists client text
    check (client is null or length(client) <= 80);

-- Parcelado é sempre "todo mês" com fim: é o que faz cada parcela cair
-- no seu mês nas funções que já existem.
alter table public.incomes
  drop constraint if exists incomes_parcelado_tem_fim;
alter table public.incomes
  add constraint incomes_parcelado_tem_fim
    check (installments_total is null or (kind = 'recurring' and end_date is not null));

alter table public.expenses
  add column if not exists client text
    check (client is null or length(client) <= 80);

-- ---------------------------------------------------------------------
-- 3. O que já foi recebido
-- ---------------------------------------------------------------------
create table if not exists public.income_received (
  income_id    uuid not null references public.incomes(id) on delete cascade,
  -- O mês da parcela (sempre dia 1), não o dia em que o dinheiro caiu.
  month        date not null check (month = date_trunc('month', month)::date),
  -- O dia em que o dinheiro caiu. É o que conta pro caixa.
  received_on  date not null default current_date,
  marked_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (income_id, month)
);

alter table public.income_received enable row level security;

-- Vê e marca quem é da mesma casa de quem lançou o recebimento.
drop policy if exists income_received_select on public.income_received;
create policy income_received_select on public.income_received
  for select to authenticated
  using (exists (
    select 1 from public.incomes i
    where i.id = income_id
      and i.user_id in (select public.household_member_ids())
  ));

drop policy if exists income_received_insert on public.income_received;
create policy income_received_insert on public.income_received
  for insert to authenticated
  with check (
    marked_by = (select auth.uid())
    and exists (
      select 1 from public.incomes i
      where i.id = income_id
        and i.user_id in (select public.household_member_ids())
    )
  );

drop policy if exists income_received_delete on public.income_received;
create policy income_received_delete on public.income_received
  for delete to authenticated
  using (exists (
    select 1 from public.incomes i
    where i.id = income_id
      and i.user_id in (select public.household_member_ids())
  ));

-- Sem update: desmarcar e marcar de novo. Assim marked_by nunca mente.
revoke all on public.income_received from anon;
revoke update on public.income_received from authenticated;
grant select, insert, delete on public.income_received to authenticated;

commit;
