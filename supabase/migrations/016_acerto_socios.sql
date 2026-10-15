-- =====================================================================
-- Migração 016 — Acerto entre sócios (FASE_F.md, F4)
--
-- 1. expenses.paid_by: quem pagou o gasto. Nulo = conta da empresa;
--    preenchido = saiu do bolso desse sócio (a empresa fica devendo a ele).
-- 2. incomes.received_into: onde o dinheiro caiu. Nulo = conta da
--    empresa; preenchido = caiu na conta pessoal desse sócio (ele fica
--    devendo à empresa).
-- 3. settlements: acertos feitos — "Joaquim passou R$ 340 pro Talles",
--    "a empresa reembolsou R$ 100 ao Talles". Zeram o que o app mostra
--    como pendente.
--
-- A pessoa indicada tem que ser da mesma casa de quem lançou: um gatilho
-- confere (a RLS de gastos e recebimentos só olha o dono).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1 e 2. Quem pagou / onde caiu
-- ---------------------------------------------------------------------
alter table public.expenses
  add column if not exists paid_by uuid references public.profiles(id) on delete set null;

alter table public.incomes
  add column if not exists received_into uuid references public.profiles(id) on delete set null;

create or replace function public.confere_socio_do_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pessoa uuid := case tg_table_name
    when 'expenses' then new.paid_by
    when 'incomes'  then new.received_into
  end;
begin
  if v_pessoa is not null and not exists (
    select 1
    from public.profiles alvo
    join public.profiles dono on dono.household_id = alvo.household_id
    where alvo.id = v_pessoa and dono.id = new.user_id
  ) then
    raise exception 'Só dá pra indicar um sócio da mesma empresa.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_confere_pago_por on public.expenses;
create trigger expenses_confere_pago_por
  before insert or update of paid_by on public.expenses
  for each row execute function public.confere_socio_do_lancamento();

drop trigger if exists incomes_confere_caiu_em on public.incomes;
create trigger incomes_confere_caiu_em
  before insert or update of received_into on public.incomes
  for each row execute function public.confere_socio_do_lancamento();

-- ---------------------------------------------------------------------
-- 3. Acertos feitos
-- ---------------------------------------------------------------------
create table if not exists public.settlements (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household_id()
                  references public.households(id) on delete cascade,
  -- Nulo = conta da empresa.
  from_user     uuid references public.profiles(id) on delete cascade,
  to_user       uuid references public.profiles(id) on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  paid_on       date not null default current_date,
  notes         text check (notes is null or length(notes) <= 200),
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint settlements_dois_lados
    check (from_user is distinct from to_user)
);

create index if not exists settlements_household_idx
  on public.settlements (household_id, paid_on);

alter table public.settlements enable row level security;

drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements
  for select to authenticated
  using (household_id = (select public.my_household_id()));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (
    household_id = (select public.my_household_id())
    and (select public.minha_casa_e_empresa())
    and (from_user is null or from_user in (select public.household_member_ids()))
    and (to_user is null or to_user in (select public.household_member_ids()))
    and created_by = (select auth.uid())
  );

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements
  for delete to authenticated
  using (household_id = (select public.my_household_id()));

-- Sem editar: acerto errado se apaga e se faz de novo.
revoke all on public.settlements from anon;
revoke update on public.settlements from authenticated;
grant select, insert, delete on public.settlements to authenticated;

commit;
