-- =====================================================================
-- Migração 024 — Importar extrato do banco (C30)
--
-- Gasto que veio de um extrato (CSV ou OFX do Nubank e de outros bancos)
-- guarda a "marca" da linha de onde veio: o FITID do OFX ou, no CSV,
-- data + nome + valor (+ quantas vezes a mesma linha apareceu no arquivo).
-- Mandar o mesmo extrato de novo não lança nada duas vezes.
--
-- statement_aliases: o que a pessoa ensinou. "DISTRIBUIDORA XYZ" no
-- extrato é "Esquinão", categoria Mercado. Na próxima importação o app já
-- sugere. É de cada pessoa (o extrato é dela).
--
-- Só modo pessoal — a tela não aparece na empresa. Seguro num banco com
-- dados: só cria coisa nova.
-- =====================================================================

alter table public.expenses add column if not exists extrato_ref text
  check (char_length(extrato_ref) <= 300);

comment on column public.expenses.extrato_ref is
  'Marca da linha do extrato de onde o gasto veio (C30). Nulo = lançado à mão.';

create unique index if not exists expenses_extrato_ref_unico
  on public.expenses (user_id, extrato_ref) where extrato_ref is not null;

create table if not exists public.statement_aliases (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Nome do extrato sem acento, minúsculo e sem números soltos.
  title_norm  text not null check (char_length(title_norm) between 1 and 200),
  description text not null check (char_length(description) between 1 and 120),
  category_id uuid references public.categories(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, title_norm)
);

create index if not exists statement_aliases_category_idx on public.statement_aliases (category_id);

alter table public.statement_aliases enable row level security;

drop policy if exists statement_aliases_own on public.statement_aliases;
create policy statement_aliases_own on public.statement_aliases
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.statement_aliases from anon;
