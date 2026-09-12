-- =====================================================================
-- Migração 008 — Aceite dos termos e declaração de idade
-- Spec: LGPD.md.
--
-- Roda DEPOIS da 007. Seguro num banco com dados.
--
-- Aditivo: três colunas nulas em profiles, e handle_new_user recriada
-- com o mesmo comportamento de antes MAIS o registro do aceite. Nenhum
-- drop, nenhuma linha tocada.
--
-- O que NÃO é guardado, de propósito: a data de nascimento. O formulário
-- pergunta, calcula a idade no navegador, e manda só "declarou ser
-- maior". A LGPD pede minimização — coletar o necessário pro fim — e o
-- necessário aqui é "tem 18 anos?", não a data exata.
--
-- Contas criadas antes desta migração (Talles e Duda) ficam com as três
-- colunas nulas. Não é erro: elas nasceram antes de existir termo.
-- =====================================================================

begin;

alter table public.profiles add column if not exists terms_version     text;
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists adult_declared_at timestamptz;

commit;

-- Idêntica à da 004, mais as três colunas no insert. O que vem do
-- formulário chega em raw_user_meta_data; conta criada pelo painel do
-- Supabase não traz nada, e cai em nulo sem quebrar.
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
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  insert into public.households (name)
  values ('Minha casa')
  returning id into v_household;

  v_name := coalesce(
    nullif(trim(v_meta->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (
    id, household_id, display_name, color,
    terms_version, terms_accepted_at, adult_declared_at
  )
  values (
    new.id, v_household, v_name, public.random_palette_color(),
    nullif(v_meta->>'terms_version', ''),
    case when nullif(v_meta->>'terms_version', '') is not null then now() end,
    case when (v_meta->>'adult_declared') = 'true' then now() end
  );

  return new;
end;
$$;
