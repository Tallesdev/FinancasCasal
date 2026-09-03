-- =====================================================================
-- Migração 002 — O mês definido pelo cartão
--
-- Roda DEPOIS da 001. Seguro num banco com dados.
--
-- Nenhum drop de tabela, delete, truncate ou mudança de tipo em coluna
-- existente. A coluna nova nasce nula. As duas funções que mudam são
-- substituídas por `create or replace`; a `cycle_summary` precisa de um
-- `drop function` antes porque o retorno dela muda — isso apaga a
-- definição da função, nunca uma linha de dado.
--
-- O que muda de conceito:
--   A aba do cartão passa a mostrar SÓ gasto de cartão. Pix já saiu da
--   conta quando aconteceu, não tem nada a ver com fechamento de fatura,
--   então sai do ciclo e fica só no relatório mensal.
--   A tabela bank_accounts continua existindo, com outro propósito:
--   separar de qual conta o dinheiro saiu, o que importa pra quem usa
--   mais de uma.
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
