-- =====================================================================
-- Migração 003 — A janela inteira, não só a fatura
--
-- Roda DEPOIS da 002. Seguro num banco com dados.
--
-- 100% aditivo: só cria duas funções novas. Nenhum drop, nenhum alter,
-- nenhuma tabela ou coluna tocada. Rodar duas vezes dá o mesmo resultado.
--
-- Por quê: a tela do ciclo sabia somar a fatura e a renda, mas não o que
-- saiu no Pix nem o que foi investido dentro da mesma janela. Com isso, a
-- "sobra" era só renda menos fatura — um número que parecia saldo e não
-- era. Estas duas funções fecham a conta.
--
-- income_in_window (migração 002) completa o trio.
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
