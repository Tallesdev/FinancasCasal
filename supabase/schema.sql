-- =====================================================================
-- Finanças do Casal — schema Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.payment_method as enum ('card', 'pix');
exception when duplicate_object then null; end $$;

do $$ begin
  -- variable          -> gasto avulso, acontece uma vez
  -- fixed_recurring   -> gasto fixo mensal (end_date nulo = sem fim previsto)
  -- fixed_installment -> parcelado, termina sozinho após N parcelas
  create type public.expense_kind as enum ('variable', 'fixed_recurring', 'fixed_installment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entry_kind as enum ('one_time', 'recurring');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Households (a "casa" do casal) e perfis
-- ---------------------------------------------------------------------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Nossa casa',
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  household_id  uuid references public.households(id) on delete set null,
  display_name  text not null,
  -- 'a' e 'b' definem a cor de identidade de cada pessoa na interface
  accent        text not null default 'a' check (accent in ('a', 'b')),
  created_at    timestamptz not null default now()
);

create index if not exists profiles_household_idx on public.profiles (household_id);

-- ---------------------------------------------------------------------
-- Helpers de escopo (usados pelas policies de RLS)
-- ---------------------------------------------------------------------
create or replace function public.my_household_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

create or replace function public.household_member_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.household_id is not distinct from public.my_household_id()
    and public.my_household_id() is not null;
$$;

-- ---------------------------------------------------------------------
-- Cartões — privados: só o dono enxerga os próprios cartões
-- ---------------------------------------------------------------------
create table if not exists public.cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null,
  closing_day  int check (closing_day between 1 and 31),
  due_day      int check (due_day between 1 and 31),
  color        text,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists cards_user_idx on public.cards (user_id);

-- ---------------------------------------------------------------------
-- Categorias — cada um cria as suas.
-- Leitura é liberada para a casa toda porque o relatório do casal
-- agrupa os gastos pelo NOME da categoria.
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  color       text not null default '#8B93A7',
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------------
-- Renda
-- ---------------------------------------------------------------------
create table if not exists public.incomes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  source      text not null,
  amount      numeric(12, 2) not null check (amount > 0),
  kind        public.entry_kind not null default 'recurring',
  start_date  date not null,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint incomes_one_time_no_end
    check (kind <> 'one_time' or end_date is null),
  constraint incomes_end_after_start
    check (end_date is null or end_date >= start_date)
);

create index if not exists incomes_user_idx on public.incomes (user_id, start_date);

-- ---------------------------------------------------------------------
-- Gastos (cartão e pix, fixos e variáveis)
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  payment_method     public.payment_method not null,
  kind               public.expense_kind not null,
  card_id            uuid references public.cards(id) on delete set null,
  category_id        uuid references public.categories(id) on delete set null,
  description        text not null,
  -- valor de UMA ocorrência: o gasto avulso, a mensalidade ou a parcela
  amount             numeric(12, 2) not null check (amount > 0),
  start_date         date not null,
  end_date           date,
  installments_total int,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint expenses_card_requires_card_id
    check (payment_method <> 'card' or card_id is not null),

  constraint expenses_variable_shape
    check (kind <> 'variable' or (end_date is null and installments_total is null)),

  constraint expenses_recurring_shape
    check (kind <> 'fixed_recurring' or installments_total is null),

  constraint expenses_installment_shape
    check (kind <> 'fixed_installment' or (end_date is null and installments_total >= 2)),

  constraint expenses_end_after_start
    check (end_date is null or end_date >= start_date)
);

create index if not exists expenses_user_idx on public.expenses (user_id, start_date);
create index if not exists expenses_category_idx on public.expenses (category_id);
create index if not exists expenses_card_idx on public.expenses (card_id);

-- ---------------------------------------------------------------------
-- Investimentos
-- ---------------------------------------------------------------------
create table if not exists public.investments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  asset_type  text not null default 'Outros',
  amount      numeric(12, 2) not null check (amount > 0),
  kind        public.entry_kind not null default 'recurring',
  start_date  date not null,
  end_date    date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint investments_one_time_no_end
    check (kind <> 'one_time' or end_date is null),
  constraint investments_end_after_start
    check (end_date is null or end_date >= start_date)
);

create index if not exists investments_user_idx on public.investments (user_id, start_date);

-- ---------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists incomes_touch on public.incomes;
create trigger incomes_touch before update on public.incomes
  for each row execute function public.touch_updated_at();

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

drop trigger if exists investments_touch on public.investments;
create trigger investments_touch before update on public.investments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- Expansão de recorrências
-- Um gasto fixo é gravado UMA vez. Estas funções projetam ele nos meses
-- em que ele acontece, para o dashboard e os relatórios.
-- Rodam com os direitos de quem chama, então a RLS continua valendo.
-- ---------------------------------------------------------------------
create or replace function public.expense_occurrences(p_from date, p_to date)
returns table (
  expense_id          uuid,
  user_id             uuid,
  month               date,
  amount              numeric(12, 2),
  payment_method      public.payment_method,
  kind                public.expense_kind,
  card_id             uuid,
  category_id         uuid,
  description         text,
  installment_number  int,
  installments_total  int
)
language sql stable
as $$
  with bounds as (
    select date_trunc('month', p_from)::date as m_from,
           date_trunc('month', p_to)::date   as m_to
  ),
  base as (
    select
      e.*,
      date_trunc('month', e.start_date)::date as m_start,
      case e.kind
        when 'variable' then
          date_trunc('month', e.start_date)::date
        when 'fixed_installment' then
          (date_trunc('month', e.start_date)
            + make_interval(months => e.installments_total - 1))::date
        else
          coalesce(date_trunc('month', e.end_date)::date, (select m_to from bounds))
      end as m_end
    from public.expenses e
  )
  select
    b.id,
    b.user_id,
    g.m::date,
    b.amount,
    b.payment_method,
    b.kind,
    b.card_id,
    b.category_id,
    b.description,
    case
      when b.kind = 'fixed_installment'
      then ((extract(year from age(g.m, b.m_start)) * 12
            + extract(month from age(g.m, b.m_start)))::int + 1)
      else null
    end,
    b.installments_total
  from base b
  cross join bounds bd
  cross join lateral generate_series(
    greatest(b.m_start, bd.m_from),
    least(b.m_end, bd.m_to),
    interval '1 month'
  ) as g(m);
$$;

create or replace function public.income_occurrences(p_from date, p_to date)
returns table (
  income_id uuid,
  user_id   uuid,
  month     date,
  amount    numeric(12, 2),
  source    text
)
language sql stable
as $$
  with bounds as (
    select date_trunc('month', p_from)::date as m_from,
           date_trunc('month', p_to)::date   as m_to
  ),
  base as (
    select
      i.*,
      date_trunc('month', i.start_date)::date as m_start,
      case i.kind
        when 'one_time' then date_trunc('month', i.start_date)::date
        else coalesce(date_trunc('month', i.end_date)::date, (select m_to from bounds))
      end as m_end
    from public.incomes i
  )
  select b.id, b.user_id, g.m::date, b.amount, b.source
  from base b
  cross join bounds bd
  cross join lateral generate_series(
    greatest(b.m_start, bd.m_from),
    least(b.m_end, bd.m_to),
    interval '1 month'
  ) as g(m);
$$;

create or replace function public.investment_occurrences(p_from date, p_to date)
returns table (
  investment_id uuid,
  user_id       uuid,
  month         date,
  amount        numeric(12, 2),
  name          text,
  asset_type    text
)
language sql stable
as $$
  with bounds as (
    select date_trunc('month', p_from)::date as m_from,
           date_trunc('month', p_to)::date   as m_to
  ),
  base as (
    select
      v.*,
      date_trunc('month', v.start_date)::date as m_start,
      case v.kind
        when 'one_time' then date_trunc('month', v.start_date)::date
        else coalesce(date_trunc('month', v.end_date)::date, (select m_to from bounds))
      end as m_end
    from public.investments v
  )
  select b.id, b.user_id, g.m::date, b.amount, b.name, b.asset_type
  from base b
  cross join bounds bd
  cross join lateral generate_series(
    greatest(b.m_start, bd.m_from),
    least(b.m_end, bd.m_to),
    interval '1 month'
  ) as g(m);
$$;

-- ---------------------------------------------------------------------
-- Resumo mensal pronto (entradas, saídas, investimentos, saldo)
-- ---------------------------------------------------------------------
create or replace function public.monthly_summary(p_from date, p_to date)
returns table (
  month       date,
  user_id     uuid,
  income      numeric(12, 2),
  expense     numeric(12, 2),
  investment  numeric(12, 2)
)
language sql stable
as $$
  select
    m.month,
    m.user_id,
    coalesce(sum(m.income), 0)::numeric(12, 2),
    coalesce(sum(m.expense), 0)::numeric(12, 2),
    coalesce(sum(m.investment), 0)::numeric(12, 2)
  from (
    select month, user_id, amount as income, 0 as expense, 0 as investment
      from public.income_occurrences(p_from, p_to)
    union all
    select month, user_id, 0, amount, 0
      from public.expense_occurrences(p_from, p_to)
    union all
    select month, user_id, 0, 0, amount
      from public.investment_occurrences(p_from, p_to)
  ) m
  group by m.month, m.user_id
  order by m.month;
$$;

-- ---------------------------------------------------------------------
-- Ranking de categorias. Agrupa pelo NOME e devolve o user_id, para o
-- cliente filtrar por escopo. Na visão do casal, categorias de mesmo nome
-- nas duas contas somam — a soma acontece depois do filtro de escopo.
-- ---------------------------------------------------------------------
create or replace function public.category_ranking(p_from date, p_to date)
returns table (
  user_id        uuid,
  category_name  text,
  color          text,
  total          numeric(12, 2),
  entries        bigint
)
language sql stable
as $$
  select
    o.user_id,
    coalesce(c.name, 'Sem categoria') as category_name,
    coalesce(min(c.color), '#8B93A7')  as color,
    sum(o.amount)::numeric(12, 2)      as total,
    count(*)                           as entries
  from public.expense_occurrences(p_from, p_to) o
  left join public.categories c on c.id = o.category_id
  group by o.user_id, 1, 2
  order by total desc;
$$;

-- =====================================================================
-- Row Level Security
-- Regra geral: LEITURA vale para a casa toda (para o relatório do casal),
-- ESCRITA só nos próprios registros. Cartões são exceção: leitura privada.
-- =====================================================================

alter table public.households  enable row level security;
alter table public.profiles    enable row level security;
alter table public.cards       enable row level security;
alter table public.categories  enable row level security;
alter table public.incomes     enable row level security;
alter table public.expenses    enable row level security;
alter table public.investments enable row level security;

-- households
drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select using (id = public.my_household_id());

-- profiles
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or id in (select public.household_member_ids()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- cards (leitura privada)
drop policy if exists cards_select_own on public.cards;
create policy cards_select_own on public.cards
  for select using (user_id = auth.uid());

drop policy if exists cards_write_own on public.cards;
create policy cards_write_own on public.cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- categories
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select using (user_id in (select public.household_member_ids()));

drop policy if exists categories_write_own on public.categories;
create policy categories_write_own on public.categories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- incomes
drop policy if exists incomes_select on public.incomes;
create policy incomes_select on public.incomes
  for select using (user_id in (select public.household_member_ids()));

drop policy if exists incomes_write_own on public.incomes;
create policy incomes_write_own on public.incomes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- expenses
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (user_id in (select public.household_member_ids()));

drop policy if exists expenses_write_own on public.expenses;
create policy expenses_write_own on public.expenses
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- investments
drop policy if exists investments_select on public.investments;
create policy investments_select on public.investments
  for select using (user_id in (select public.household_member_ids()));

drop policy if exists investments_write_own on public.investments;
create policy investments_write_own on public.investments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
