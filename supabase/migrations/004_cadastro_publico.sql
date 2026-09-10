-- =====================================================================
-- Migração 004 — Cadastro público
-- Spec: FASE_B.md, seções 1.1 e 1.2.
--
-- Roda DEPOIS da 003. Seguro num banco com dados.
--
-- profiles já tem linhas de verdade. A parte 1 faz backfill ANTES de
-- travar a coluna nova como obrigatória, tudo numa transação: se algo
-- falhar no meio, nada fica pela metade. A coluna `accent` antiga fica
-- onde está, sem uso — aposentar campo nunca justifica drop sem
-- necessidade (mesmo critério de bank_accounts).
--
-- A parte 2 é o padrão oficial do Supabase para criar perfil no cadastro.
-- O gatilho só dispara em INSERT novo em auth.users: quem já existe não é
-- tocado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Parte 1: cor por pessoa. Substitui o binário accent ('a' | 'b') por um
-- hexadecimal livre, na mesma paleta de categorias e cartões.
-- ---------------------------------------------------------------------
begin;

alter table public.profiles add column if not exists color text;

-- Mesmos hexadecimais que 'a' e 'b' já apontavam: ninguém muda de cor.
update public.profiles
set color = case accent
  when 'a' then '#7FD1AE'
  when 'b' then '#E9A13B'
  else '#7FD1AE'
end
where color is null;

alter table public.profiles alter column color set default '#7FD1AE';
alter table public.profiles alter column color set not null;

do $$ begin
  alter table public.profiles
    add constraint profiles_color_format check (color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;

commit;

-- ---------------------------------------------------------------------
-- Parte 2: auto-provisionamento. Toda pessoa nova nasce com perfil, casa
-- própria (de uma pessoa só, até convidar alguém), nome e cor — sem
-- ninguém rodar SQL na mão.
-- ---------------------------------------------------------------------

-- Espelha PALETTE de src/lib/palette.ts. Se a paleta mudar lá, muda aqui.
create or replace function public.random_palette_color()
returns text
language sql
as $$
  select (array[
    '#7FD1AE', '#E9A13B', '#C77DFF', '#E06C7B', '#6C8AE4',
    '#4CC9F0', '#F4A261', '#95D5B2', '#B5838D', '#8B93A7'
  ])[floor(random() * 10 + 1)::int];
$$;

-- security definer: roda com os privilégios de quem criou a função, não
-- da pessoa se cadastrando. É o mesmo mecanismo de my_household_id() e
-- household_member_ids(). Por isso profiles não precisa (nem ganha) de
-- política de insert para usuário comum — só o gatilho insere ali.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_name text;
begin
  -- Defesa contra rodar duas vezes pro mesmo usuário. Não deveria
  -- acontecer; custa nada não duplicar perfil se acontecer.
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.households (name)
  values ('Minha casa')
  returning id into v_household;

  -- O nome vem do formulário de cadastro (raw_user_meta_data). Se vier
  -- vazio, cai pro que está antes do @ do e-mail.
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, household_id, display_name, color)
  values (new.id, v_household, v_name, public.random_palette_color());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
