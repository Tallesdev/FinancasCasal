-- =====================================================================
-- Migração 001 — Contas bancárias e relatório por ciclo de fatura
-- Cobre RF25–RF28 do PRD.md.
--
-- SEGURO DE RODAR NUM BANCO QUE JÁ TEM DADOS.
--
-- Esta migração só ADICIONA. Não existe aqui nenhum drop de tabela,
-- delete, update de linha, truncate, nem mudança de tipo de coluna que
-- já existe. As duas colunas novas nascem nulas, então nenhuma linha
-- atual precisa ser reescrita. Rodar duas vezes dá o mesmo resultado
-- que rodar uma (tudo é "if not exists" ou "create or replace").
--
-- NÃO rode o seed.sql de novo — ele cria uma casa nova a cada execução.
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
