-- =====================================================================
-- Migração 006 — Código curto de convite
--
-- Roda DEPOIS da 005. Seguro num banco com dados: adiciona uma coluna
-- nula, faz backfill, e recria três funções. O único drop é de FUNÇÃO
-- (create_invite muda o retorno, e isso não dá por create or replace) —
-- nunca de dado.
--
-- Por quê: o link de 48 caracteres não dá pra ditar por telefone nem
-- digitar de cabeça. O código de 8 dá. É POR CONVITE, com validade, igual
-- ao link — nunca um código permanente da casa, que seria uma senha eterna
-- pras finanças de todo mundo, sem "expulsar" pra desfazer.
--
-- Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L): 8 dígitos + 23 letras
-- = 31 símbolos. 31^8 ≈ 850 bilhões de combinações — não dá pra chutar,
-- mesmo sem limite de tentativas no banco.
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
