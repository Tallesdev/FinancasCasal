-- =====================================================================
-- Migração 010 — Tipo de casa (família ou empresa)
--
-- 100% aditivo: enum novo + coluna com default, sem tocar em nenhuma
-- função ou política existente. my_household_id()/household_member_ids()
-- continuam só olhando household_id — o tipo da casa não afeta escopo
-- de dado nenhum, só o rótulo mostrado na interface.
-- =====================================================================

begin;

do $$ begin
  create type public.household_kind as enum ('familia', 'empresa');
exception when duplicate_object then null; end $$;

-- Default cobre toda casa existente num só passo: não é retrofit de um
-- valor que já existia implícito (como foi a cor em 007), é uma escolha
-- nova que vale 'familia' pra quem nunca mexeu nisso.
alter table public.households
  add column if not exists kind public.household_kind not null default 'familia';

-- name e color já foram liberados na 008; só falta kind.
grant update (kind) on public.households to authenticated;

commit;
