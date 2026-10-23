-- =====================================================================
-- Migração 023 — Orçamentos aprovados e agenda da empresa (C27, C29)
--
-- 1. O recebimento lembra de qual orçamento veio (app JJ Orçamentos, que
--    tem banco próprio). Sem chave estrangeira: o orçamento mora no outro
--    banco. Um orçamento vira no máximo um recebimento.
-- 2. Orçamento aprovado que não vai virar recebimento (já lançado à mão,
--    ou antigo) pode ser tirado da lista: quote_dismissals.
-- 3. Agenda: cliente marcado num dia, com os serviços combinados e os
--    detalhes. É da empresa: os sócios veem, marcam e editam.
--
-- Clientes e serviços NÃO moram aqui: são os mesmos do app de orçamentos
-- (C28), lidos e gravados pelo servidor. O atendimento guarda uma cópia do
-- nome, telefone e endereço, pra agenda abrir rápido e não depender do
-- outro banco.
--
-- Seguro num banco com dados: só cria coisa nova.
-- =====================================================================

-- ---------------------------------------------------------------- 1
alter table public.incomes add column if not exists quote_id uuid;
alter table public.incomes add column if not exists quote_number text;

comment on column public.incomes.quote_id is
  'Orçamento (app JJ Orçamentos, outro banco) que virou este recebimento. Nulo = lançado à mão.';

create unique index if not exists incomes_quote_unico
  on public.incomes (quote_id) where quote_id is not null;

-- ---------------------------------------------------------------- 2
create table if not exists public.quote_dismissals (
  household_id uuid not null default public.my_household_id()
    references public.households(id) on delete cascade,
  quote_id     uuid not null,
  dismissed_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (household_id, quote_id)
);

alter table public.quote_dismissals enable row level security;

drop policy if exists quote_dismissals_da_casa on public.quote_dismissals;
create policy quote_dismissals_da_casa on public.quote_dismissals
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

revoke all on public.quote_dismissals from anon;

-- ---------------------------------------------------------------- 3
create table if not exists public.appointments (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.my_household_id()
    references public.households(id) on delete cascade,
  -- Quem marcou: é o que responde "quem me avisou disso?".
  created_by     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Quem vai atender. Nulo = qualquer um / os dois.
  assigned_to    uuid references public.profiles(id) on delete set null,
  date           date not null,
  start_time     time,
  end_time       time,
  -- Cliente do app de orçamentos (outro banco, sem FK) + cópia do que a
  -- agenda mostra. Cliente digitado sem cadastro fica com client_id nulo.
  client_id      uuid,
  client_name    text not null check (char_length(client_name) between 1 and 120),
  client_phone   text check (char_length(client_phone) <= 40),
  client_address text check (char_length(client_address) <= 300),
  -- [{ "catalog_id": uuid|null, "name": text }]
  services       jsonb not null default '[]'::jsonb check (jsonb_typeof(services) = 'array'),
  -- O geral do que vai ser feito nesse cliente. Não é item por item.
  details        text check (char_length(details) <= 4000),
  status         text not null default 'marcado' check (status in ('marcado', 'feito', 'cancelado')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_time is null or start_time is null or end_time >= start_time)
);

create index if not exists appointments_casa_dia_idx on public.appointments (household_id, date);
create index if not exists appointments_created_by_idx on public.appointments (created_by);
create index if not exists appointments_assigned_to_idx on public.appointments (assigned_to);

create or replace function public.appointments_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- "Quem marcou" é sempre quem está logado, não o que o navegador mandou.
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.updated_at := now();
    -- A casa e quem marcou não mudam depois de criado.
    new.household_id := old.household_id;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch
  before insert or update on public.appointments
  for each row execute function public.appointments_touch();

-- Quem atende precisa ser da mesma casa.
create or replace function public.appointments_atende_da_casa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.assigned_to and p.household_id = new.household_id
  ) then
    raise exception 'Quem atende precisa ser da empresa.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_atende_da_casa on public.appointments;
create trigger appointments_atende_da_casa
  before insert or update of assigned_to on public.appointments
  for each row execute function public.appointments_atende_da_casa();

alter table public.appointments enable row level security;

-- A agenda é da empresa: os dois sócios veem, marcam, editam e apagam.
drop policy if exists appointments_da_casa on public.appointments;
create policy appointments_da_casa on public.appointments
  for all to authenticated
  using (household_id = (select public.my_household_id()))
  with check (
    household_id = (select public.my_household_id())
    and (select public.minha_casa_e_empresa())
  );

revoke all on public.appointments from anon;
