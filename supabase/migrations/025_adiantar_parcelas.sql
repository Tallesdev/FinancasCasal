-- =====================================================================
-- Migração 025 — Adiantar parcelas (C38)
--
-- Compra parcelada em que a pessoa paga algumas parcelas antes da hora
-- (o "antecipar parcelas" do banco). Cada parcela adiantada vira uma linha
-- aqui: QUAL parcela, QUANDO foi paga e QUANTO (o banco costuma dar
-- desconto). O gasto em si não muda.
--
-- As três funções que abrem o parcelado em parcelas (por mês, por dia e
-- por ciclo do cartão) passam a olhar esta tabela: a parcela adiantada sai
-- do mês dela e entra no dia em que foi paga. Todo o resto (resumo do mês,
-- ranking de categorias, fatura, acerto entre sócios) usa essas funções e
-- acompanha sozinho.
--
-- As funções ganham a coluna `advanced` no fim, por isso são recriadas.
-- Seguro num banco com dados: só cria coisa nova; sem adiantamento, as
-- parcelas saem exatamente como antes.
-- =====================================================================

create table if not exists public.installment_advances (
  id                 uuid primary key default gen_random_uuid(),
  expense_id         uuid not null references public.expenses(id) on delete cascade,
  user_id            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  installment_number int not null check (installment_number >= 1),
  paid_on            date not null,
  amount             numeric(12, 2) not null check (amount > 0),
  created_at         timestamptz not null default now(),
  unique (expense_id, installment_number)
);

comment on table public.installment_advances is
  'Parcelas pagas antes da hora (C38). A parcela sai do mês dela e entra em paid_on, com amount.';

create index if not exists installment_advances_user_idx on public.installment_advances (user_id);

-- Só quem lançou o gasto adianta, só em parcelado e só parcela que existe.
create or replace function public.installment_advances_confere()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  g record;
begin
  select user_id, kind, installments_total into g
    from public.expenses where id = new.expense_id;
  if not found or g.user_id is distinct from auth.uid() then
    raise exception 'Só quem lançou o gasto pode adiantar as parcelas dele.';
  end if;
  if g.kind <> 'fixed_installment' then
    raise exception 'Só gasto parcelado tem parcela pra adiantar.';
  end if;
  if new.installment_number > coalesce(g.installments_total, 0) then
    raise exception 'Esse gasto não tem a parcela %.', new.installment_number;
  end if;
  new.user_id := g.user_id;
  return new;
end;
$$;

drop trigger if exists installment_advances_confere on public.installment_advances;
create trigger installment_advances_confere
  before insert on public.installment_advances
  for each row execute function public.installment_advances_confere();

alter table public.installment_advances enable row level security;

-- Vê quem vê o gasto (a pessoa e a casa/empresa dela); mexe só o dono.
drop policy if exists installment_advances_select on public.installment_advances;
create policy installment_advances_select on public.installment_advances
  for select to authenticated
  using (user_id = (select auth.uid()) or user_id in (select public.household_member_ids()));

drop policy if exists installment_advances_insert on public.installment_advances;
create policy installment_advances_insert on public.installment_advances
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists installment_advances_delete on public.installment_advances;
create policy installment_advances_delete on public.installment_advances
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Desfazer é apagar e adiantar de novo: não tem edição.
revoke all on public.installment_advances from anon;
revoke update on public.installment_advances from authenticated;

-- ---------------------------------------------------------------------
-- Ocorrências por mês. Fora do parcelado, igual a antes.
-- ---------------------------------------------------------------------
drop function if exists public.expense_occurrences(date, date);
create function public.expense_occurrences(p_from date, p_to date)
returns table (
  expense_id         uuid,
  user_id            uuid,
  month              date,
  amount             numeric,
  payment_method     public.payment_method,
  kind               public.expense_kind,
  card_id            uuid,
  category_id        uuid,
  description        text,
  installment_number int,
  installments_total int,
  advanced           boolean
)
language sql stable
as $$
  with bounds as (
    select date_trunc('month', p_from)::date as m_from,
           date_trunc('month', p_to)::date   as m_to
  ),
  outros as (
    select
      e.*,
      date_trunc('month', e.start_date)::date as m_start,
      case e.kind
        when 'variable' then date_trunc('month', e.start_date)::date
        else coalesce(date_trunc('month', e.end_date)::date, (select m_to from bounds))
      end as m_end
    from public.expenses e
    where e.kind <> 'fixed_installment'
  ),
  parcelas as (
    select
      e.id, e.user_id,
      coalesce(
        date_trunc('month', a.paid_on)::date,
        (date_trunc('month', e.start_date) + make_interval(months => n.n - 1))::date
      ) as month,
      coalesce(a.amount, e.amount) as amount,
      e.payment_method, e.kind, e.card_id, e.category_id, e.description,
      n.n as installment_number,
      e.installments_total,
      a.id is not null as advanced
    from public.expenses e
    cross join lateral generate_series(1, coalesce(e.installments_total, 1)) as n(n)
    left join public.installment_advances a
      on a.expense_id = e.id and a.installment_number = n.n
    where e.kind = 'fixed_installment'
  )
  select
    o.id, o.user_id, g.m::date, o.amount, o.payment_method, o.kind,
    o.card_id, o.category_id, o.description, null::int, o.installments_total, false
  from outros o
  cross join bounds bd
  cross join lateral generate_series(
    greatest(o.m_start, bd.m_from),
    least(o.m_end, bd.m_to),
    interval '1 month'
  ) as g(m)
  union all
  select
    p.id, p.user_id, p.month, p.amount, p.payment_method, p.kind,
    p.card_id, p.category_id, p.description, p.installment_number, p.installments_total, p.advanced
  from parcelas p
  cross join bounds bd
  where p.month between bd.m_from and bd.m_to;
$$;

-- ---------------------------------------------------------------------
-- Ocorrências por dia numa janela qualquer (ciclo, início).
-- ---------------------------------------------------------------------
drop function if exists public.expenses_in_window(date, date);
create function public.expenses_in_window(p_from date, p_to date)
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
  installments_total int,
  advanced           boolean
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
    where e.kind <> 'fixed_installment'
  ),
  parcelas as (
    select
      e.id, e.user_id, e.description,
      coalesce(a.amount, e.amount) as amount,
      e.payment_method, e.kind, e.card_id, e.category_id,
      n.n as installment_number, e.installments_total,
      coalesce(
        a.paid_on,
        public.clamped_day(
          extract(year  from (date_trunc('month', e.start_date) + make_interval(months => n.n - 1)))::int,
          extract(month from (date_trunc('month', e.start_date) + make_interval(months => n.n - 1)))::int,
          extract(day   from e.start_date)::int
        )
      ) as occurred_on,
      a.id is not null as advanced
    from public.expenses e
    cross join lateral generate_series(1, coalesce(e.installments_total, 1)) as n(n)
    left join public.installment_advances a
      on a.expense_id = e.id and a.installment_number = n.n
    where e.kind = 'fixed_installment'
  )
  select * from (
    select
      o.id, o.user_id, o.occurred_on, o.description, o.amount,
      o.payment_method, o.kind, o.card_id, o.category_id,
      null::int, o.installments_total, false
    from ocorrencias o
    where o.n >= 0
      and o.occurred_on between p_from and p_to
      and (
        (o.kind = 'variable' and o.n = 0)
        or (o.kind = 'fixed_recurring' and (o.end_date is null or o.occurred_on <= o.end_date))
      )
    union all
    select
      p.id, p.user_id, p.occurred_on, p.description, p.amount,
      p.payment_method, p.kind, p.card_id, p.category_id,
      p.installment_number, p.installments_total, p.advanced
    from parcelas p
    where p.occurred_on between p_from and p_to
  ) t
  order by 3, 4;
$$;

-- ---------------------------------------------------------------------
-- O que cai num ciclo do cartão (fatura). Mesma regra: a parcela
-- adiantada entra no ciclo do dia em que foi paga.
-- ---------------------------------------------------------------------
drop function if exists public.cycle_expense_detail(uuid, date);
create function public.cycle_expense_detail(p_card_id uuid, p_reference_date date)
returns table (
  expense_id         uuid,
  occurred_on        date,
  description        text,
  amount             numeric,
  payment_method     public.payment_method,
  kind               public.expense_kind,
  category_id        uuid,
  installment_number int,
  installments_total int,
  advanced           boolean
)
language sql stable
as $$
  with b as (
    select * from public.card_cycle_bounds(p_card_id, p_reference_date)
  )
  select
    w.expense_id, w.occurred_on, w.description, w.amount, w.payment_method,
    w.kind, w.category_id, w.installment_number, w.installments_total, w.advanced
  from b
  cross join lateral public.expenses_in_window(b.cycle_start, b.cycle_end) w
  where w.user_id = auth.uid()
    and w.payment_method = 'card'
    and w.card_id = p_card_id
  order by w.occurred_on, w.description;
$$;

-- Mesmas permissões de antes: o Supabase dá execução a anon e authenticated
-- em função nova (sem sessão, a RLS não devolve nada de qualquer jeito).
