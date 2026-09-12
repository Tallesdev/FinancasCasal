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


-- =====================================================================
-- Contas bancárias e ciclo de fatura (RF25–RF28)
-- Idêntico a supabase/migrations/001_contas_e_ciclo.sql. Num banco que
-- já existe, rode a migração; aqui fica para instalação nova sair
-- completa de uma vez.
-- =====================================================================
-- ---------------------------------------------------------------------
-- Contas bancárias — privadas, mesma regra dos cartões (RF28)
-- ---------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  color       text not null default '#8B93A7',
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists bank_accounts_user_idx on public.bank_accounts (user_id);

-- ---------------------------------------------------------------------
-- Vínculos novos. Ambos opcionais: nenhum lançamento existente muda.
-- O cartão aponta para a conta que paga a fatura dele; o gasto no Pix
-- aponta para a conta de onde o dinheiro saiu (RF25).
-- ---------------------------------------------------------------------
alter table public.cards
  add column if not exists bank_account_id uuid
  references public.bank_accounts(id) on delete set null;

alter table public.expenses
  add column if not exists bank_account_id uuid
  references public.bank_accounts(id) on delete set null;

create index if not exists cards_bank_account_idx    on public.cards (bank_account_id);
create index if not exists expenses_bank_account_idx on public.expenses (bank_account_id);

-- ---------------------------------------------------------------------
-- RLS: conta bancária é privada até na leitura, igual cartão
-- ---------------------------------------------------------------------
alter table public.bank_accounts enable row level security;

drop policy if exists bank_accounts_select_own on public.bank_accounts;
create policy bank_accounts_select_own on public.bank_accounts
  for select using (user_id = auth.uid());

drop policy if exists bank_accounts_write_own on public.bank_accounts;
create policy bank_accounts_write_own on public.bank_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Ciclo de fatura
--
-- O relatório mensal responde "quanto ganhei e gastei no mês" e não
-- muda. Isto aqui responde outra pergunta: "quanto vou pagar de fato".
-- Uma compra feita depois do fechamento só entra na fatura seguinte.
-- =====================================================================

-- Dia do mês que existe de verdade. Fechamento no dia 31 vira 28 em
-- fevereiro — é aproximação consciente, registrada no PRD como pergunta
-- em aberto.
create or replace function public.clamped_day(p_year int, p_month int, p_day int)
returns date
language sql immutable
as $$
  select make_date(
    p_year,
    p_month,
    least(
      p_day,
      extract(day from (make_date(p_year, p_month, 1) + interval '1 month - 1 day'))::int
    )
  );
$$;

-- ---------------------------------------------------------------------
-- Janela do ciclo que contém uma data, e o vencimento dela.
--
-- Fechamento no dia 13: uma compra em 20/08 cai no ciclo 14/08–13/09.
-- O próprio dia do fechamento pertence ao ciclo que TERMINA nele.
--
-- Cartão sem closing_day devolve zero linhas de propósito: a tela
-- explica isso e aponta pra /cartoes, em vez de inventar uma janela.
-- Como `cards` é privado, um cartão que não é seu também devolve zero.
-- ---------------------------------------------------------------------
create or replace function public.card_cycle_bounds(
  p_card_id uuid,
  p_reference_date date
)
returns table (
  cycle_start date,
  cycle_end   date,
  due_date    date
)
language sql stable
as $$
  with c as (
    select closing_day, due_day
    from public.cards
    where id = p_card_id and closing_day is not null
  ),
  fim as (
    select
      c.closing_day,
      c.due_day,
      case
        when public.clamped_day(
               extract(year  from p_reference_date)::int,
               extract(month from p_reference_date)::int,
               c.closing_day) >= p_reference_date
        then public.clamped_day(
               extract(year  from p_reference_date)::int,
               extract(month from p_reference_date)::int,
               c.closing_day)
        else public.clamped_day(
               extract(year  from (p_reference_date + interval '1 month'))::int,
               extract(month from (p_reference_date + interval '1 month'))::int,
               c.closing_day)
      end as cycle_end
    from c
  )
  select
    -- O ciclo começa no dia seguinte ao fechamento anterior.
    (public.clamped_day(
       extract(year  from (f.cycle_end - interval '1 month'))::int,
       extract(month from (f.cycle_end - interval '1 month'))::int,
       f.closing_day) + 1)::date,
    f.cycle_end,
    -- Vencimento: o dia de vencimento a partir do fechamento. Se o dia
    -- do vencimento já passou no mês do fechamento, cai no mês seguinte.
    case
      when f.due_day is null then null
      when public.clamped_day(
             extract(year  from f.cycle_end)::int,
             extract(month from f.cycle_end)::int,
             f.due_day) >= f.cycle_end
      then public.clamped_day(
             extract(year  from f.cycle_end)::int,
             extract(month from f.cycle_end)::int,
             f.due_day)
      else public.clamped_day(
             extract(year  from (f.cycle_end + interval '1 month'))::int,
             extract(month from (f.cycle_end + interval '1 month'))::int,
             f.due_day)
    end
  from fim f;
$$;

-- ---------------------------------------------------------------------
-- Os lançamentos que caem dentro da janela do ciclo.
--
-- Entram: gastos do próprio cartão, mais gastos no Pix marcados com a
-- MESMA conta bancária do cartão. Pix sem conta marcada não entra em
-- ciclo nenhum — foi decisão explícita do PRD (regra 7), não descuido.
--
-- Diferente de expense_occurrences, aqui a data importa por dia, não
-- por mês: a janela atravessa dois meses do calendário. Um fixo cai no
-- mesmo dia do mês em que começou.
-- ---------------------------------------------------------------------
create or replace function public.cycle_expense_detail(
  p_card_id uuid,
  p_reference_date date
)
returns table (
  expense_id         uuid,
  occurred_on        date,
  description        text,
  amount             numeric(12, 2),
  payment_method     public.payment_method,
  kind               public.expense_kind,
  category_id        uuid,
  installment_number int,
  installments_total int
)
language sql stable
as $$
  with b as (
    select * from public.card_cycle_bounds(p_card_id, p_reference_date)
  ),
  cartao as (
    select id, bank_account_id from public.cards where id = p_card_id
  ),
  elegivel as (
    select e.*
    from public.expenses e
    cross join cartao c
    -- A fatura é minha: só os meus lançamentos entram nela.
    where e.user_id = auth.uid()
      and (
        (e.payment_method = 'card' and e.card_id = c.id)
        or (
          e.payment_method = 'pix'
          and c.bank_account_id is not null
          and e.bank_account_id = c.bank_account_id
        )
      )
  ),
  meses as (
    select generate_series(
      date_trunc('month', (select cycle_start from b)),
      date_trunc('month', (select cycle_end   from b)),
      interval '1 month'
    )::date as m
  ),
  ocorrencias as (
    select
      e.id,
      e.description,
      e.amount,
      e.payment_method,
      e.kind,
      e.category_id,
      e.installments_total,
      e.end_date,
      public.clamped_day(
        extract(year  from m.m)::int,
        extract(month from m.m)::int,
        extract(day   from e.start_date)::int
      ) as occurred_on,
      (extract(year  from m.m)::int - extract(year  from e.start_date)::int) * 12
        + (extract(month from m.m)::int - extract(month from e.start_date)::int) as n
    from elegivel e
    cross join meses m
  )
  select
    o.id,
    o.occurred_on,
    o.description,
    o.amount,
    o.payment_method,
    o.kind,
    o.category_id,
    case when o.kind = 'fixed_installment' then o.n + 1 else null end,
    o.installments_total
  from ocorrencias o
  cross join b
  where o.n >= 0
    and o.occurred_on between b.cycle_start and b.cycle_end
    and (
      (o.kind = 'variable' and o.n = 0)
      or (o.kind = 'fixed_installment' and o.n < o.installments_total)
      or (o.kind = 'fixed_recurring' and (o.end_date is null or o.occurred_on <= o.end_date))
    )
  order by o.occurred_on, o.description;
$$;

-- ---------------------------------------------------------------------
-- Total do ciclo, geral e por forma de pagamento (RF27)
-- ---------------------------------------------------------------------
create or replace function public.cycle_summary(
  p_card_id uuid,
  p_reference_date date
)
returns table (
  total       numeric(12, 2),
  total_card  numeric(12, 2),
  total_pix   numeric(12, 2),
  entries     bigint
)
language sql stable
as $$
  select
    coalesce(sum(d.amount), 0)::numeric(12, 2),
    coalesce(sum(d.amount) filter (where d.payment_method = 'card'), 0)::numeric(12, 2),
    coalesce(sum(d.amount) filter (where d.payment_method = 'pix'),  0)::numeric(12, 2),
    count(*)
  from public.cycle_expense_detail(p_card_id, p_reference_date) d;
$$;

-- ---------------------------------------------------------------------
-- Ranking de categoria dentro da janela do ciclo (RF27).
-- Espelha category_ranking, mas sem user_id: o ciclo já é de uma
-- pessoa só, então não existe visão de casal aqui.
-- ---------------------------------------------------------------------
create or replace function public.cycle_category_ranking(
  p_card_id uuid,
  p_reference_date date
)
returns table (
  category_name  text,
  color          text,
  total          numeric(12, 2),
  entries        bigint
)
language sql stable
as $$
  select
    coalesce(c.name, 'Sem categoria')  as category_name,
    coalesce(min(c.color), '#8B93A7')  as color,
    sum(d.amount)::numeric(12, 2)      as total,
    count(*)                           as entries
  from public.cycle_expense_detail(p_card_id, p_reference_date) d
  left join public.categories c on c.id = d.category_id
  group by 1
  order by total desc;
$$;


-- =====================================================================
-- O mês definido pelo cartão
-- Idêntico a supabase/migrations/002_mes_pelo_cartao.sql. Vem depois de
-- propósito: substitui as definições de cycle_expense_detail e
-- cycle_summary escritas acima, que ainda juntavam Pix ao ciclo.
-- =====================================================================
-- ---------------------------------------------------------------------
-- O cartão que define o mês da pessoa.
-- Nulo = mês do calendário, que é o caso de quem recebe salário fixo.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists anchor_card_id uuid
  references public.cards(id) on delete set null;

-- ---------------------------------------------------------------------
-- Lançamentos do ciclo: agora só o que é do próprio cartão.
-- ---------------------------------------------------------------------
create or replace function public.cycle_expense_detail(
  p_card_id uuid,
  p_reference_date date
)
returns table (
  expense_id         uuid,
  occurred_on        date,
  description        text,
  amount             numeric(12, 2),
  payment_method     public.payment_method,
  kind               public.expense_kind,
  category_id        uuid,
  installment_number int,
  installments_total int
)
language sql stable
as $$
  with b as (
    select * from public.card_cycle_bounds(p_card_id, p_reference_date)
  ),
  elegivel as (
    select e.*
    from public.expenses e
    -- A fatura é minha e é deste cartão. Pix não entra: ele já saiu da
    -- conta no dia em que aconteceu.
    where e.user_id = auth.uid()
      and e.payment_method = 'card'
      and e.card_id = p_card_id
  ),
  meses as (
    select generate_series(
      date_trunc('month', (select cycle_start from b)),
      date_trunc('month', (select cycle_end   from b)),
      interval '1 month'
    )::date as m
  ),
  ocorrencias as (
    select
      e.id, e.description, e.amount, e.payment_method, e.kind,
      e.category_id, e.installments_total, e.end_date,
      public.clamped_day(
        extract(year  from m.m)::int,
        extract(month from m.m)::int,
        extract(day   from e.start_date)::int
      ) as occurred_on,
      (extract(year  from m.m)::int - extract(year  from e.start_date)::int) * 12
        + (extract(month from m.m)::int - extract(month from e.start_date)::int) as n
    from elegivel e
    cross join meses m
  )
  select
    o.id, o.occurred_on, o.description, o.amount, o.payment_method, o.kind,
    o.category_id,
    case when o.kind = 'fixed_installment' then o.n + 1 else null end,
    o.installments_total
  from ocorrencias o
  cross join b
  where o.n >= 0
    and o.occurred_on between b.cycle_start and b.cycle_end
    and (
      (o.kind = 'variable' and o.n = 0)
      or (o.kind = 'fixed_installment' and o.n < o.installments_total)
      or (o.kind = 'fixed_recurring' and (o.end_date is null or o.occurred_on <= o.end_date))
    )
  order by o.occurred_on, o.description;
$$;

-- ---------------------------------------------------------------------
-- Total do ciclo. Perde a quebra por forma de pagamento, que agora
-- seria sempre 100% cartão.
-- ---------------------------------------------------------------------
drop function if exists public.cycle_summary(uuid, date);

create or replace function public.cycle_summary(
  p_card_id uuid,
  p_reference_date date
)
returns table (
  total    numeric(12, 2),
  entries  bigint
)
language sql stable
as $$
  select
    coalesce(sum(d.amount), 0)::numeric(12, 2),
    count(*)
  from public.cycle_expense_detail(p_card_id, p_reference_date) d;
$$;

-- ---------------------------------------------------------------------
-- Renda projetada POR DIA dentro de uma janela qualquer.
--
-- income_occurrences responde por mês, e isso não serve pra uma janela
-- que vai do dia 14 ao dia 13. Aqui cada renda cai no dia em que ela
-- acontece: a avulsa na própria data, a recorrente no mesmo dia do mês
-- em que começou.
--
-- Devolve user_id para filtrar por escopo no cliente, igual às outras.
-- ---------------------------------------------------------------------
create or replace function public.income_in_window(
  p_from date,
  p_to date
)
returns table (
  income_id    uuid,
  user_id      uuid,
  occurred_on  date,
  amount       numeric(12, 2),
  source       text
)
language sql stable
as $$
  with meses as (
    select generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    )::date as m
  ),
  ocorrencias as (
    select
      i.id, i.user_id, i.amount, i.source, i.kind, i.start_date, i.end_date,
      public.clamped_day(
        extract(year  from m.m)::int,
        extract(month from m.m)::int,
        extract(day   from i.start_date)::int
      ) as occurred_on,
      (extract(year  from m.m)::int - extract(year  from i.start_date)::int) * 12
        + (extract(month from m.m)::int - extract(month from i.start_date)::int) as n
    from public.incomes i
    cross join meses m
  )
  select o.id, o.user_id, o.occurred_on, o.amount, o.source
  from ocorrencias o
  where o.n >= 0
    and o.occurred_on between p_from and p_to
    and (
      (o.kind = 'one_time' and o.n = 0)
      or (o.kind = 'recurring' and (o.end_date is null or o.occurred_on <= o.end_date))
    )
  order by o.occurred_on;
$$;


-- =====================================================================
-- Projeção por dia da janela inteira
-- Idêntico a supabase/migrations/003_janela_completa.sql.
-- =====================================================================
-- ---------------------------------------------------------------------
-- Gastos projetados POR DIA dentro de uma janela qualquer.
--
-- Mesma ideia de expense_occurrences, mas por dia em vez de por mês: uma
-- janela 14→13 atravessa dois meses do calendário, então saber só o mês
-- não diz de que lado do fechamento o gasto caiu.
--
-- Devolve user_id para filtrar por escopo no cliente, igual às outras.
-- ---------------------------------------------------------------------
create or replace function public.expenses_in_window(
  p_from date,
  p_to date
)
returns table (
  expense_id         uuid,
  user_id            uuid,
  occurred_on        date,
  description        text,
  amount             numeric(12, 2),
  payment_method     public.payment_method,
  kind               public.expense_kind,
  card_id            uuid,
  category_id        uuid,
  installment_number int,
  installments_total int
)
language sql stable
as $$
  with meses as (
    select generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    )::date as m
  ),
  ocorrencias as (
    select
      e.id, e.user_id, e.description, e.amount, e.payment_method, e.kind,
      e.card_id, e.category_id, e.installments_total, e.end_date,
      public.clamped_day(
        extract(year  from m.m)::int,
        extract(month from m.m)::int,
        extract(day   from e.start_date)::int
      ) as occurred_on,
      (extract(year  from m.m)::int - extract(year  from e.start_date)::int) * 12
        + (extract(month from m.m)::int - extract(month from e.start_date)::int) as n
    from public.expenses e
    cross join meses m
  )
  select
    o.id, o.user_id, o.occurred_on, o.description, o.amount,
    o.payment_method, o.kind, o.card_id, o.category_id,
    case when o.kind = 'fixed_installment' then o.n + 1 else null end,
    o.installments_total
  from ocorrencias o
  where o.n >= 0
    and o.occurred_on between p_from and p_to
    and (
      (o.kind = 'variable' and o.n = 0)
      or (o.kind = 'fixed_installment' and o.n < o.installments_total)
      or (o.kind = 'fixed_recurring' and (o.end_date is null or o.occurred_on <= o.end_date))
    )
  order by o.occurred_on, o.description;
$$;

-- ---------------------------------------------------------------------
-- Aportes projetados por dia dentro de uma janela qualquer.
-- Investimento é saída, não sobra (regra 5 do PRD), então precisa entrar
-- na conta da janela igual entra na conta do mês.
-- ---------------------------------------------------------------------
create or replace function public.investments_in_window(
  p_from date,
  p_to date
)
returns table (
  investment_id  uuid,
  user_id        uuid,
  occurred_on    date,
  amount         numeric(12, 2),
  name           text,
  asset_type     text
)
language sql stable
as $$
  with meses as (
    select generate_series(
      date_trunc('month', p_from),
      date_trunc('month', p_to),
      interval '1 month'
    )::date as m
  ),
  ocorrencias as (
    select
      v.id, v.user_id, v.amount, v.name, v.asset_type, v.kind,
      v.start_date, v.end_date,
      public.clamped_day(
        extract(year  from m.m)::int,
        extract(month from m.m)::int,
        extract(day   from v.start_date)::int
      ) as occurred_on,
      (extract(year  from m.m)::int - extract(year  from v.start_date)::int) * 12
        + (extract(month from m.m)::int - extract(month from v.start_date)::int) as n
    from public.investments v
    cross join meses m
  )
  select o.id, o.user_id, o.occurred_on, o.amount, o.name, o.asset_type
  from ocorrencias o
  where o.n >= 0
    and o.occurred_on between p_from and p_to
    and (
      (o.kind = 'one_time' and o.n = 0)
      or (o.kind = 'recurring' and (o.end_date is null or o.occurred_on <= o.end_date))
    )
  order by o.occurred_on;
$$;


-- =====================================================================
-- Cadastro público: cor por pessoa e auto-provisionamento
-- Idêntico a supabase/migrations/004_cadastro_publico.sql.
-- =====================================================================
-- ---------------------------------------------------------------------
-- Parte 1: cor por pessoa. Substitui o binário accent ('a' | 'b') por um
-- hexadecimal livre, na mesma paleta de categorias e cartões.
-- ---------------------------------------------------------------------
begin;

alter table public.profiles add column if not exists color text;

-- Mesmos hexadecimais que 'a' e 'b' já apontavam: ninguém muda de cor.
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

-- ---------------------------------------------------------------------
-- Parte 2: auto-provisionamento. Toda pessoa nova nasce com perfil, casa
-- própria (de uma pessoa só, até convidar alguém), nome e cor — sem
-- ninguém rodar SQL na mão.
-- ---------------------------------------------------------------------

-- Espelha PALETTE de src/lib/palette.ts. Se a paleta mudar lá, muda aqui.
create or replace function public.random_palette_color()
returns text
language sql
as $$
  select (array[
    '#7FD1AE', '#E9A13B', '#C77DFF', '#E06C7B', '#6C8AE4',
    '#4CC9F0', '#F4A261', '#95D5B2', '#B5838D', '#8B93A7'
  ])[floor(random() * 10 + 1)::int];
$$;

-- security definer: roda com os privilégios de quem criou a função, não
-- da pessoa se cadastrando. É o mesmo mecanismo de my_household_id() e
-- household_member_ids(). Por isso profiles não precisa (nem ganha) de
-- política de insert para usuário comum — só o gatilho insere ali.
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
  -- Defesa contra rodar duas vezes pro mesmo usuário. Não deveria
  -- acontecer; custa nada não duplicar perfil se acontecer.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.households (name)
  values ('Minha casa')
  returning id into v_household;

  -- O nome vem do formulário de cadastro (raw_user_meta_data). Se vier
  -- vazio, cai pro que está antes do @ do e-mail.
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


-- =====================================================================
-- Casa com até 6 pessoas e convite por link
-- Idêntico a supabase/migrations/005_casa_e_convite.sql.
-- =====================================================================
-- ---------------------------------------------------------------------
-- Convites. O token é o que vai no link: 24 bytes aleatórios em hex
-- (48 caracteres) — não dá para chutar, e não revela nada da casa.
-- ---------------------------------------------------------------------
create table if not exists public.household_invites (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households(id) on delete cascade,
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_by    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Opcional. Preenchido = só esse e-mail consegue aceitar.
  invited_email text,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'revoked', 'expired')),
  -- Sem "expulsar" nesta fase, a validade é o que limita o estrago de um
  -- link esquecido num grupo. Vencer também devolve a vaga no limite de 6.
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_by   uuid references public.profiles(id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists household_invites_household_idx
  on public.household_invites (household_id);

-- ---------------------------------------------------------------------
-- RLS. Quem é da casa vê e revoga os convites da casa. Sem insert (passa
-- por create_invite, que valida o limite) e sem delete (revoga-se).
-- Quem foi convidado não é da casa ainda: o que ela vê vem de get_invite.
-- ---------------------------------------------------------------------
alter table public.household_invites enable row level security;

drop policy if exists household_invites_select on public.household_invites;
create policy household_invites_select on public.household_invites
  for select using (household_id = public.my_household_id());

drop policy if exists household_invites_update on public.household_invites;
create policy household_invites_update on public.household_invites
  for update using (household_id = public.my_household_id())
  with check (household_id = public.my_household_id());

-- Qualquer membro renomeia a casa. Sem dono, sem hierarquia.
drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update using (id = public.my_household_id())
  with check (id = public.my_household_id());

-- =====================================================================
-- As quatro funções. Todas security definer, mesmo mecanismo de
-- handle_new_user. Cada uma valida sozinha o que precisa: a interface só
-- repete o aviso, quem garante é o banco.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Criar convite. Limite de 6 conta membros + pendentes não vencidos —
-- senão alguém cria dez convites com dois membros e a casa estoura
-- quando todos aceitam.
-- ---------------------------------------------------------------------
create or replace function public.create_invite(p_email text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_ocupadas  int;
  v_token     text;
begin
  v_household := public.my_household_id();
  if v_household is null then
    raise exception 'Você precisa estar numa casa para convidar alguém.';
  end if;

  select
    (select count(*) from public.profiles where household_id = v_household)
    + (select count(*) from public.household_invites
        where household_id = v_household
          and status = 'pending'
          and expires_at > now())
  into v_ocupadas;

  if v_ocupadas >= 6 then
    raise exception 'A casa já está no limite de 6 pessoas, contando convites pendentes.';
  end if;

  insert into public.household_invites (household_id, invited_email)
  values (v_household, nullif(lower(trim(p_email)), ''))
  returning token into v_token;

  return v_token;
end;
$$;

-- ---------------------------------------------------------------------
-- O que a página do convite mostra, com ou sem sessão. Só o necessário:
-- nada de household_id, nada de e-mail em texto. Token inválido, vencido
-- ou usado devolve zero linhas.
-- ---------------------------------------------------------------------
create or replace function public.get_invite(p_token text)
returns table (
  household_name  text,
  inviter_name    text,
  inviter_color   text,
  member_count    bigint,
  expires_at      timestamptz,
  email_locked    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.name,
    p.display_name,
    p.color,
    (select count(*) from public.profiles where household_id = i.household_id),
    i.expires_at,
    i.invited_email is not null
  from public.household_invites i
  join public.households h on h.id = i.household_id
  join public.profiles   p on p.id = i.created_by
  where i.token = p_token
    and i.status = 'pending'
    and i.expires_at > now();
$$;

-- ---------------------------------------------------------------------
-- Aceitar. Uma transação: ou acontece inteiro, ou nada.
-- ---------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_inv      public.household_invites%rowtype;
  v_my_email text;
  v_old      uuid;
  v_membros  int;
  v_cor      text;
  v_livre    text;
begin
  if v_me is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  select * into v_inv
  from public.household_invites
  where token = p_token and status = 'pending' and expires_at > now();

  if not found then
    raise exception 'Esse convite não vale mais. Peça um novo para quem te convidou.';
  end if;

  if v_inv.invited_email is not null then
    select lower(email) into v_my_email from auth.users where id = v_me;
    if v_my_email is distinct from v_inv.invited_email then
      raise exception 'Este convite foi feito para outro e-mail.';
    end if;
  end if;

  select household_id into v_old from public.profiles where id = v_me;

  if v_old = v_inv.household_id then
    raise exception 'Você já está nesta casa.';
  end if;

  -- Só entra quem está sozinho na sua. Evita "puxar" uma casa inteira para
  -- dentro de outra sem os outros saberem.
  if v_old is not null and exists (
    select 1 from public.profiles where household_id = v_old and id <> v_me
  ) then
    raise exception 'Você já divide uma casa. Saia dela antes de entrar em outra.';
  end if;

  -- Checado de novo aqui: dois aceites ao mesmo tempo passam os dois na
  -- checagem de criação.
  select count(*) into v_membros
  from public.profiles where household_id = v_inv.household_id;
  if v_membros >= 6 then
    raise exception 'Essa casa já está cheia: 6 pessoas.';
  end if;

  -- Cor sem colisão. 10 cores, 6 pessoas: sempre sobra uma livre.
  select color into v_cor from public.profiles where id = v_me;
  if exists (
    select 1 from public.profiles
    where household_id = v_inv.household_id and color = v_cor
  ) then
    select c into v_livre
    from unnest(array[
      '#7FD1AE', '#E9A13B', '#C77DFF', '#E06C7B', '#6C8AE4',
      '#4CC9F0', '#F4A261', '#95D5B2', '#B5838D', '#8B93A7'
    ]) as c
    where c not in (
      select color from public.profiles where household_id = v_inv.household_id
    )
    limit 1;
    if v_livre is not null then
      update public.profiles set color = v_livre where id = v_me;
    end if;
  end if;

  -- O ponto central: um campo em uma linha. O histórico vem junto.
  update public.profiles set household_id = v_inv.household_id where id = v_me;

  -- A casa solo que ficou para trás some. Sem casa fantasma.
  if v_old is not null and not exists (
    select 1 from public.profiles where household_id = v_old
  ) then
    delete from public.households where id = v_old;
  end if;

  update public.household_invites
  set status = 'accepted', accepted_by = v_me, accepted_at = now()
  where id = v_inv.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Sair. Nunca falha por "ser o último": o último leva a casa embora.
-- ---------------------------------------------------------------------
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_old uuid;
  v_new uuid;
begin
  if v_me is null then
    raise exception 'Entre na sua conta.';
  end if;

  select household_id into v_old from public.profiles where id = v_me;

  insert into public.households (name) values ('Minha casa') returning id into v_new;
  update public.profiles set household_id = v_new where id = v_me;

  if v_old is not null then
    -- Não sou mais de lá: meus convites de lá não valem mais.
    update public.household_invites
    set status = 'revoked'
    where household_id = v_old and created_by = v_me and status = 'pending';

    if not exists (select 1 from public.profiles where household_id = v_old) then
      delete from public.households where id = v_old;
    end if;
  end if;
end;
$$;


-- =====================================================================
-- Código curto de convite
-- Idêntico a supabase/migrations/006_codigo_de_convite.sql. Vem depois de
-- propósito: substitui create_invite, get_invite e accept_invite acima.
-- =====================================================================
create or replace function public.gen_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', (floor(random() * 31) + 1)::int, 1),
    ''
  )
  from generate_series(1, 8);
$$;

alter table public.household_invites
  add column if not exists code text unique;

-- Convites que já existiam ganham código também.
update public.household_invites
set code = public.gen_invite_code()
where code is null;

-- ---------------------------------------------------------------------
-- create_invite passa a devolver token E código.
-- ---------------------------------------------------------------------
drop function if exists public.create_invite(text);

create or replace function public.create_invite(p_email text default null)
returns table (token text, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_ocupadas  int;
  v_tentativa int := 0;
begin
  v_household := public.my_household_id();
  if v_household is null then
    raise exception 'Você precisa estar numa casa para convidar alguém.';
  end if;

  select
    (select count(*) from public.profiles where household_id = v_household)
    + (select count(*) from public.household_invites
        where household_id = v_household
          and status = 'pending'
          and expires_at > now())
  into v_ocupadas;

  if v_ocupadas >= 6 then
    raise exception 'A casa já está no limite de 6 pessoas, contando convites pendentes.';
  end if;

  -- Colisão de código é astronomicamente rara, mas custa nada tentar de novo.
  loop
    begin
      return query
        insert into public.household_invites (household_id, invited_email, code)
        values (v_household, nullif(lower(trim(p_email)), ''), public.gen_invite_code())
        returning household_invites.token, household_invites.code;
      return;
    exception when unique_violation then
      v_tentativa := v_tentativa + 1;
      if v_tentativa >= 5 then
        raise exception 'Não deu para gerar o convite. Tente de novo.';
      end if;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- get_invite e accept_invite aceitam o token OU o código no mesmo
-- parâmetro. Não há colisão: token é 48 hex minúsculo, código é 8
-- maiúsculo. Assim /convite/<código> funciona sem rota nova.
-- ---------------------------------------------------------------------
create or replace function public.get_invite(p_token text)
returns table (
  household_name  text,
  inviter_name    text,
  inviter_color   text,
  member_count    bigint,
  expires_at      timestamptz,
  email_locked    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.name,
    p.display_name,
    p.color,
    (select count(*) from public.profiles where household_id = i.household_id),
    i.expires_at,
    i.invited_email is not null
  from public.household_invites i
  join public.households h on h.id = i.household_id
  join public.profiles   p on p.id = i.created_by
  where (i.token = p_token or i.code = upper(replace(p_token, '-', '')))
    and i.status = 'pending'
    and i.expires_at > now();
$$;

create or replace function public.accept_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_inv      public.household_invites%rowtype;
  v_my_email text;
  v_old      uuid;
  v_membros  int;
  v_cor      text;
  v_livre    text;
begin
  if v_me is null then
    raise exception 'Entre na sua conta para aceitar o convite.';
  end if;

  select * into v_inv
  from public.household_invites
  where (token = p_token or code = upper(replace(p_token, '-', '')))
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'Esse convite não vale mais. Peça um novo para quem te convidou.';
  end if;

  if v_inv.invited_email is not null then
    select lower(email) into v_my_email from auth.users where id = v_me;
    if v_my_email is distinct from v_inv.invited_email then
      raise exception 'Este convite foi feito para outro e-mail.';
    end if;
  end if;

  select household_id into v_old from public.profiles where id = v_me;

  if v_old = v_inv.household_id then
    raise exception 'Você já está nesta casa.';
  end if;

  if v_old is not null and exists (
    select 1 from public.profiles where household_id = v_old and id <> v_me
  ) then
    raise exception 'Você já divide uma casa. Saia dela antes de entrar em outra.';
  end if;

  select count(*) into v_membros
  from public.profiles where household_id = v_inv.household_id;
  if v_membros >= 6 then
    raise exception 'Essa casa já está cheia: 6 pessoas.';
  end if;

  select color into v_cor from public.profiles where id = v_me;
  if exists (
    select 1 from public.profiles
    where household_id = v_inv.household_id and color = v_cor
  ) then
    select c into v_livre
    from unnest(array[
      '#7FD1AE', '#E9A13B', '#C77DFF', '#E06C7B', '#6C8AE4',
      '#4CC9F0', '#F4A261', '#95D5B2', '#B5838D', '#8B93A7'
    ]) as c
    where c not in (
      select color from public.profiles where household_id = v_inv.household_id
    )
    limit 1;
    if v_livre is not null then
      update public.profiles set color = v_livre where id = v_me;
    end if;
  end if;

  update public.profiles set household_id = v_inv.household_id where id = v_me;

  if v_old is not null and not exists (
    select 1 from public.profiles where household_id = v_old
  ) then
    delete from public.households where id = v_old;
  end if;

  update public.household_invites
  set status = 'accepted', accepted_by = v_me, accepted_at = now()
  where id = v_inv.id;
end;
$$;


-- =====================================================================
-- Cor da casa
-- Idêntico a supabase/migrations/007_cor_da_casa.sql.
-- =====================================================================
begin;

alter table public.households add column if not exists color text;

-- O roxo que já era a cor de "todos" no CSS: ninguém vê mudança.
update public.households set color = '#C77DFF' where color is null;

alter table public.households alter column color set default '#C77DFF';
alter table public.households alter column color set not null;

do $$ begin
  alter table public.households
    add constraint households_color_format check (color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;

commit;


-- =====================================================================
-- Aceite dos termos e declaração de idade
-- Idêntico a supabase/migrations/008_aceite_e_idade.sql. Substitui
-- handle_new_user definida acima.
-- =====================================================================
begin;

alter table public.profiles add column if not exists terms_version     text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists adult_declared_at timestamptz;

commit;

-- Idêntica à da 004, mais as três colunas no insert. O que vem do
-- formulário chega em raw_user_meta_data; conta criada pelo painel do
-- Supabase não traz nada, e cai em nulo sem quebrar.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_name text;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.households (name)
  values ('Minha casa')
  returning id into v_household;

  v_name := coalesce(
    nullif(trim(v_meta->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (
    id, household_id, display_name, color,
    terms_version, terms_accepted_at, adult_declared_at
  )
  values (
    new.id, v_household, v_name, public.random_palette_color(),
    nullif(v_meta->>'terms_version', ''),
    case when nullif(v_meta->>'terms_version', '') is not null then now() end,
    case when (v_meta->>'adult_declared') = 'true' then now() end
  );

  return new;
end;
$$;
