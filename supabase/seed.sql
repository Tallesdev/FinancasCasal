-- =====================================================================
-- Seed — rode DEPOIS de criar os dois usuários no painel do Supabase
-- (Authentication > Users > Add user, com "Auto Confirm User" marcado).
--
-- Troque os dois e-mails e nomes abaixo pelos de vocês.
-- Os valores reais ficam em seed.local.sql, que o git ignora.
-- =====================================================================

do $$
declare
  v_household uuid;
  v_a uuid;
  v_b uuid;
  email_a text := 'voce@exemplo.com';
  email_b text := 'ela@exemplo.com';
  nome_a  text := 'Nome A';
  nome_b  text := 'Nome B';
begin
  select id into v_a from auth.users where email = email_a;
  select id into v_b from auth.users where email = email_b;

  if v_a is null or v_b is null then
    raise exception 'Crie os dois usuários no painel de Authentication antes de rodar o seed.';
  end if;

  insert into public.households (name) values ('Nossa casa') returning id into v_household;

  -- Com o gatilho de cadastro, cada conta já nasce com perfil e casa
  -- própria. O seed só junta as duas na mesma casa e fixa as cores.
  insert into public.profiles (id, household_id, display_name, accent, color)
  values (v_a, v_household, nome_a, 'a', '#7FD1AE')
  on conflict (id) do update
    set household_id = excluded.household_id,
        display_name = excluded.display_name,
        accent = excluded.accent,
        color = excluded.color;

  insert into public.profiles (id, household_id, display_name, accent, color)
  values (v_b, v_household, nome_b, 'b', '#E9A13B')
  on conflict (id) do update
    set household_id = excluded.household_id,
        display_name = excluded.display_name,
        accent = excluded.accent,
        color = excluded.color;

  raise notice 'Casa criada: %', v_household;
end $$;

-- Categorias iniciais para os dois (opcional — dá para apagar e criar as suas na interface)
insert into public.categories (user_id, name, color)
select p.id, c.name, c.color
from public.profiles p
cross join (values
  ('Alimentação',  '#E9A13B'),
  ('Mercado',      '#7FD1AE'),
  ('Transporte',   '#6C8AE4'),
  ('Moradia',      '#C77DFF'),
  ('Saúde',        '#E06C7B'),
  ('Lazer',        '#4CC9F0'),
  ('Assinaturas',  '#B5838D'),
  ('Educação',     '#95D5B2'),
  ('Outros',       '#8B93A7')
) as c(name, color)
on conflict (user_id, name) do nothing;
