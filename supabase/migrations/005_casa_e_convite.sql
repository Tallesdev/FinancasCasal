-- =====================================================================
-- Migração 005 — Casa com até 6 pessoas e convite por link
-- Spec: FASE_C.md.
--
-- Roda DEPOIS da 004. Seguro num banco com dados.
--
-- 100% aditivo: uma tabela nova, políticas novas, quatro funções novas.
-- Nenhuma tabela ou coluna existente é tocada. Rodar duas vezes dá o
-- mesmo resultado.
--
-- A ideia central: nenhuma tabela de dado tem household_id — gasto,
-- renda, cartão, tudo é por user_id. A casa só existe em
-- profiles.household_id. Então mudar alguém de casa é trocar um campo
-- em uma linha, e o histórico vem junto. Não existe migração de dado.
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
