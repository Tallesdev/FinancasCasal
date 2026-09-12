-- =====================================================================
-- Migração 007 — Cor da casa
--
-- Roda DEPOIS da 006. Seguro num banco com dados.
--
-- 100% aditivo: uma coluna nova com default, backfill e uma constraint
-- de formato. Nenhum drop, nenhuma função tocada.
--
-- Por quê: a cor do escopo "todos" era fixa no CSS (--color-couple, roxo).
-- Fazia sentido quando a casa era sempre um casal; com casa de até 6
-- pessoas e nome próprio ("Família Silva"), a cor também vira identidade
-- da casa. Cada pessoa já escolhe a sua desde a 004; agora a casa escolhe
-- a dela.
-- =====================================================================

begin;

alter table public.households add column if not exists color text;

-- O roxo que já era a cor de "todos" no CSS: ninguém vê mudança.
update public.households set color = '#C77DFF' where color is null;

alter table public.households alter column color set default '#C77DFF';
alter table public.households alter column color set not null;

do $$ begin
  alter table public.households
    add constraint households_color_format check (color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;

commit;
