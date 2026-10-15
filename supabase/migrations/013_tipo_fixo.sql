-- =====================================================================
-- Migração 013 — Casa é casa, empresa é empresa (FASE_F.md, C5 e C8)
--
-- Depende da 011. O tipo é escolhido no cadastro e não muda mais:
--   1. Ninguém troca o tipo pelo app (antes: só sozinho na casa).
--   2. Sair de uma empresa leva para uma empresa nova, não para uma casa
--      de família (antes: leave_household criava sempre "Minha casa").
--   3. Convite só vale entre contas do mesmo tipo (antes: só avisava).
--      Conta pessoal dentro de empresa mistura gasto de casa com gasto da
--      empresa, e abre contas e cartões dela aos sócios.
--
-- Pelo SQL Editor (sem usuário logado, auth.uid() nulo) ainda dá pra
-- corrigir um tipo errado à mão, se um dia precisar.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tipo fixo
-- ---------------------------------------------------------------------
revoke update (kind) on public.households from authenticated;

create or replace function public.households_tipo_fixo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind and auth.uid() is not null then
    raise exception 'O tipo é escolhido ao criar a conta e não muda depois.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists households_tipo_so_sozinho on public.households;
drop function if exists public.households_tipo_so_sozinho();

drop trigger if exists households_tipo_fixo on public.households;
create trigger households_tipo_fixo
  before update of kind on public.households
  for each row execute function public.households_tipo_fixo();

-- ---------------------------------------------------------------------
-- 2. Sair mantém o tipo. Igual à 005, só a casa nova herda o kind.
-- ---------------------------------------------------------------------
create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me   uuid := auth.uid();
  v_old  uuid;
  v_new  uuid;
  v_kind public.household_kind;
begin
  if v_me is null then
    raise exception 'Entre na sua conta.';
  end if;

  select household_id into v_old from public.profiles where id = v_me;
  select coalesce((select kind from public.households where id = v_old), 'familia')
    into v_kind;

  insert into public.households (name, kind)
  values (case when v_kind = 'empresa' then 'Minha empresa' else 'Minha casa' end, v_kind)
  returning id into v_new;
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

-- ---------------------------------------------------------------------
-- 3. Convite só entre contas do mesmo tipo. Igual à 006, mais a checagem
--    logo depois de achar a casa atual.
-- ---------------------------------------------------------------------
create or replace function public.accept_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me        uuid := auth.uid();
  v_inv       public.household_invites%rowtype;
  v_my_email  text;
  v_old       uuid;
  v_membros   int;
  v_cor       text;
  v_livre     text;
  v_meu_tipo  public.household_kind;
  v_tipo_dela public.household_kind;
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

  select kind into v_meu_tipo  from public.households where id = v_old;
  select kind into v_tipo_dela from public.households where id = v_inv.household_id;
  if v_meu_tipo is not null and v_meu_tipo is distinct from v_tipo_dela then
    if v_tipo_dela = 'empresa' then
      raise exception 'Este convite é de uma empresa, e a sua conta é pessoal. Entre com a conta da empresa.';
    else
      raise exception 'Este convite é de uma casa, e a sua conta é de empresa. Entre com a sua conta pessoal.';
    end if;
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

commit;
