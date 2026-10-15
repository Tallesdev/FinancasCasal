-- =====================================================================
-- Migração 015 — Lucro e divisão da empresa (FASE_F.md, F3)
--
-- 1. households.reserve_pct: quanto do lucro fica na empresa antes de
--    dividir. Começa em 0% (decisão 6).
-- 2. profit_shares: a % de cada sócio (decisão 4: 60/40, configurável).
--    Só muda pela função definir_divisao, que confere que é empresa, que
--    todo sócio está na lista e que a soma dá 100%.
-- 3. withdrawals: retiradas — "Talles retirou R$ 2.000 em 10/11". Qualquer
--    sócio registra (inclusive a do outro), todos veem.
--
-- Nada disso existe pra conta pessoal: as tabelas só aceitam empresa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Reserva
-- ---------------------------------------------------------------------
alter table public.households
  add column if not exists reserve_pct numeric(5, 2) not null default 0
    check (reserve_pct >= 0 and reserve_pct <= 100);

-- ---------------------------------------------------------------------
-- 2. % de cada sócio
-- ---------------------------------------------------------------------
create table if not exists public.profit_shares (
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  pct           numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  updated_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.profit_shares enable row level security;

drop policy if exists profit_shares_select on public.profit_shares;
create policy profit_shares_select on public.profit_shares
  for select to authenticated
  using (household_id = (select public.my_household_id()));

-- Escrever, só pela função abaixo.
revoke all on public.profit_shares from anon;
revoke insert, update, delete on public.profit_shares from authenticated;
grant select on public.profit_shares to authenticated;

-- p_partes: [{"user_id": "...", "pct": 60}, {"user_id": "...", "pct": 40}]
create or replace function public.definir_divisao(p_reserva numeric, p_partes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_casa    uuid := public.my_household_id();
  v_soma    numeric := 0;
  v_membros int;
  v_itens   int;
  v_parte   jsonb;
begin
  if v_casa is null then
    raise exception 'Entre na sua conta.';
  end if;
  if not public.minha_casa_e_empresa() then
    raise exception 'Divisão de lucro é só da empresa.';
  end if;
  if p_reserva is null or p_reserva < 0 or p_reserva > 100 then
    raise exception 'A reserva vai de 0%% a 100%%.';
  end if;
  if jsonb_typeof(p_partes) <> 'array' then
    raise exception 'Divisão inválida.';
  end if;

  select count(*) into v_membros from public.profiles where household_id = v_casa;
  select count(distinct e->>'user_id') into v_itens from jsonb_array_elements(p_partes) e;
  if v_itens <> jsonb_array_length(p_partes) or v_itens <> v_membros then
    raise exception 'Coloque a parte de cada sócio, uma vez só.';
  end if;

  for v_parte in select * from jsonb_array_elements(p_partes) loop
    if not exists (
      select 1 from public.profiles
      where id = (v_parte->>'user_id')::uuid and household_id = v_casa
    ) then
      raise exception 'Só dá pra dividir entre os sócios da empresa.';
    end if;
    if (v_parte->>'pct')::numeric < 0 or (v_parte->>'pct')::numeric > 100 then
      raise exception 'Cada parte vai de 0%% a 100%%.';
    end if;
    v_soma := v_soma + (v_parte->>'pct')::numeric;
  end loop;

  if abs(v_soma - 100) > 0.01 then
    raise exception 'As partes precisam somar 100%% — hoje somam %.', trim_scale(v_soma) || '%';
  end if;

  delete from public.profit_shares where household_id = v_casa;
  insert into public.profit_shares (household_id, user_id, pct)
  select v_casa, (e->>'user_id')::uuid, round((e->>'pct')::numeric, 2)
  from jsonb_array_elements(p_partes) e;

  update public.households set reserve_pct = round(p_reserva, 2) where id = v_casa;
end;
$$;

revoke all on function public.definir_divisao(numeric, jsonb) from public, anon;
grant execute on function public.definir_divisao(numeric, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Retiradas
-- ---------------------------------------------------------------------
create table if not exists public.withdrawals (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household_id()
                  references public.households(id) on delete cascade,
  -- Quem retirou (não quem lançou).
  user_id       uuid not null references public.profiles(id) on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  taken_on      date not null default current_date,
  notes         text check (notes is null or length(notes) <= 200),
  created_by    uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists withdrawals_household_idx
  on public.withdrawals (household_id, taken_on);

alter table public.withdrawals enable row level security;

drop policy if exists withdrawals_select on public.withdrawals;
create policy withdrawals_select on public.withdrawals
  for select to authenticated
  using (household_id = (select public.my_household_id()));

drop policy if exists withdrawals_insert on public.withdrawals;
create policy withdrawals_insert on public.withdrawals
  for insert to authenticated
  with check (
    household_id = (select public.my_household_id())
    and (select public.minha_casa_e_empresa())
    and user_id in (select public.household_member_ids())
    and created_by = (select auth.uid())
  );

drop policy if exists withdrawals_update on public.withdrawals;
create policy withdrawals_update on public.withdrawals
  for update to authenticated
  using (household_id = (select public.my_household_id()))
  with check (
    household_id = (select public.my_household_id())
    and user_id in (select public.household_member_ids())
  );

drop policy if exists withdrawals_delete on public.withdrawals;
create policy withdrawals_delete on public.withdrawals
  for delete to authenticated
  using (household_id = (select public.my_household_id()));

revoke all on public.withdrawals from anon;
revoke update on public.withdrawals from authenticated;
grant select, insert, delete on public.withdrawals to authenticated;
-- Editar: só o que a tela edita. Casa e autor nunca mudam.
grant update (user_id, amount, taken_on, notes) on public.withdrawals to authenticated;

commit;
