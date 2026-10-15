-- =====================================================================
-- Migração 011 — Modo Empresa, fundação (FASE_F.md, F1)
--
-- Depende da 010 (households.kind). Tudo aditivo para quem é família:
-- nenhuma casa existente muda de comportamento.
--
--   1. Nome de usuário no perfil (entrar com usuário OU e-mail)
--   2. Cadastro escolhe o tipo da casa; empresa nasce com categorias
--   3. O tipo só muda enquanto a pessoa está sozinha na casa
--   4. Na empresa, contas bancárias e cartões são vistos pelos sócios
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Nome de usuário
-- Minúsculo, 3 a 30 caracteres: letras, números, ponto e sublinhado.
-- Único sem diferenciar maiúscula. Opcional: quem não tem entra por e-mail.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists username text;

do $$ begin
  alter table public.profiles
    add constraint profiles_username_formato
    check (username is null or username ~ '^[a-z0-9._]{3,30}$');
exception when duplicate_object then null; end $$;

create unique index if not exists profiles_username_unico
  on public.profiles (username) where username is not null;

grant update (username) on public.profiles to authenticated;

-- Pro cadastro avisar antes de enviar. Diz só se o nome está livre — não
-- devolve de quem é, nem e-mail. security definer porque quem ainda não
-- tem conta não enxerga profiles.
create or replace function public.usuario_disponivel(p_usuario text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(p_usuario)) ~ '^[a-z0-9._]{3,30}$'
     and not exists (
       select 1 from public.profiles where username = lower(trim(p_usuario))
     );
$$;

revoke all on function public.usuario_disponivel(text) from public;
grant execute on function public.usuario_disponivel(text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Cadastro: tipo da casa, nome de usuário e categorias de empresa
-- Mesma função da 008, com três acréscimos lidos de raw_user_meta_data:
-- household_kind, username e as categorias iniciais da empresa.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_name text;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_kind public.household_kind :=
    case when v_meta->>'household_kind' = 'empresa'
         then 'empresa'::public.household_kind
         else 'familia'::public.household_kind end;
  v_usuario text := lower(trim(coalesce(v_meta->>'username', '')));
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.households (name, kind)
  values (case when v_kind = 'empresa' then 'Minha empresa' else 'Minha casa' end, v_kind)
  returning id into v_household;

  v_name := coalesce(
    nullif(trim(v_meta->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Usuário inválido ou já em uso não derruba o cadastro: a conta nasce
  -- sem usuário e a pessoa escolhe outro em Ajustes. A tela já confere
  -- antes (usuario_disponivel), então isto é só a corrida rara.
  if v_usuario !~ '^[a-z0-9._]{3,30}$'
     or exists (select 1 from public.profiles where username = v_usuario) then
    v_usuario := null;
  end if;

  insert into public.profiles (
    id, household_id, display_name, color, username,
    terms_version, terms_accepted_at, adult_declared_at, receipts_consent_at
  )
  values (
    new.id, v_household, v_name, public.random_palette_color(), v_usuario,
    nullif(v_meta->>'terms_version', ''),
    case when nullif(v_meta->>'terms_version', '') is not null then now() end,
    case when (v_meta->>'adult_declared') = 'true' then now() end,
    case when (v_meta->>'receipts_consent') = 'true' then now() end
  );

  -- Conta pessoal começa sem categorias, como sempre foi. Empresa já
  -- nasce com as que todo serviço usa. auth.uid() é nulo aqui: o dono
  -- vai explícito.
  if v_kind = 'empresa' then
    insert into public.categories (user_id, name, color) values
      (new.id, 'Materiais',               '#6C8AE4'),
      (new.id, 'Alimentação',             '#E9A13B'),
      (new.id, 'Combustível',             '#E06C7B'),
      (new.id, 'Manutenção de máquinas',  '#C77DFF'),
      (new.id, 'Manutenção de veículos',  '#4CC9F0'),
      (new.id, 'Ferramentas',             '#F4A261'),
      (new.id, 'Impostos',                '#B5838D'),
      (new.id, 'Outros',                  '#8B93A7')
    on conflict (user_id, name) do nothing;
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. O tipo da casa só muda enquanto a pessoa está sozinha nela
-- Virar empresa abre contas e cartões para os outros membros (parte 4).
-- Se um membro pudesse trocar o tipo de uma casa com mais gente, bastaria
-- isso para ver os cartões dos outros. Sozinho, não há ninguém a expor.
-- ---------------------------------------------------------------------
create or replace function public.households_tipo_so_sozinho()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind is distinct from old.kind
     and (select count(*) from public.profiles where household_id = new.id) > 1 then
    raise exception 'O tipo só pode mudar enquanto você está sozinho na casa.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists households_tipo_so_sozinho on public.households;
create trigger households_tipo_so_sozinho
  before update of kind on public.households
  for each row execute function public.households_tipo_so_sozinho();


-- ---------------------------------------------------------------------
-- 4. Na empresa, contas bancárias e cartões são da empresa
-- Os sócios veem os de todos (a conta da empresa está no nome de um deles).
-- Escrever continua só no que é seu. Na família nada muda: privado.
-- ---------------------------------------------------------------------
create or replace function public.minha_casa_e_empresa()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select kind = 'empresa' from public.households where id = public.my_household_id()),
    false
  );
$$;

drop policy if exists bank_accounts_select_empresa on public.bank_accounts;
create policy bank_accounts_select_empresa on public.bank_accounts
  for select using (
    public.minha_casa_e_empresa()
    and user_id in (select public.household_member_ids())
  );

drop policy if exists cards_select_empresa on public.cards;
create policy cards_select_empresa on public.cards
  for select using (
    public.minha_casa_e_empresa()
    and user_id in (select public.household_member_ids())
  );

commit;
