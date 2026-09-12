-- =====================================================================
-- Migração 008 — LGPD, importação de planilha e uma correção de segurança
-- Specs: LGPD.md e IMPORTAR.md.
--
-- Roda DEPOIS da 007. Seguro num banco com dados.
--
-- Tudo aditivo, com UMA exceção deliberada, na parte 3: retira de quem
-- está logado a permissão de alterar colunas que o app nunca altera. Isso
-- não apaga nada e não muda nenhuma linha — só fecha uma porta.
-- =====================================================================


-- =====================================================================
-- 1. Aceite dos termos, idade e consentimento para recibos
-- =====================================================================
-- O que NÃO é guardado, de propósito: a data de nascimento. O formulário
-- pergunta, calcula a idade no navegador e manda só "declarou ser maior".
-- A LGPD pede minimização: o necessário é "tem 18?", não "quando nasceu".
--
-- receipts_consent_at é separado do aceite dos termos porque recibo pode
-- conter dado de saúde (sensível, art. 11), que exige consentimento
-- específico e livre: não pode estar embutido no aceite geral nem ser
-- condição para criar a conta.
--
-- Contas anteriores (Talles e Duda) ficam com essas colunas nulas: nasceram
-- antes de existir termo.

begin;

alter table public.profiles add column if not exists terms_version       text;
alter table public.profiles add column if not exists terms_accepted_at   timestamptz;
alter table public.profiles add column if not exists adult_declared_at   timestamptz;
alter table public.profiles add column if not exists receipts_consent_at timestamptz;

commit;

-- Idêntica à da 004 mais os quatro campos. O que vem do formulário chega em
-- raw_user_meta_data; conta criada pelo painel não traz nada e cai em nulo.
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
    terms_version, terms_accepted_at, adult_declared_at, receipts_consent_at
  )
  values (
    new.id, v_household, v_name, public.random_palette_color(),
    nullif(v_meta->>'terms_version', ''),
    case when nullif(v_meta->>'terms_version', '') is not null then now() end,
    case when (v_meta->>'adult_declared') = 'true' then now() end,
    case when (v_meta->>'receipts_consent') = 'true' then now() end
  );

  return new;
end;
$$;


-- =====================================================================
-- 2. Importação de planilha
-- =====================================================================
-- Cada importação vira uma linha em `imports`, e cada lançamento criado por
-- ela aponta pra essa linha. Apagar a importação apaga, por cascade, tudo o
-- que veio dela. É o que torna possível:
--   • DESFAZER uma importação errada (ex: planilha em mês/dia lida como
--     dia/mês) sem apagar lançamento por lançamento;
--   • quase-atomicidade: se a importação falha no meio, o app apaga a linha
--     de `imports` e o que já tinha entrado vai junto.
--
-- Lançamento editado depois de importado continua ligado à importação: se
-- ela for desfeita, ele some também. Isso é dito na tela antes de desfazer.

create table if not exists public.imports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  file_name   text not null,
  row_count   int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists imports_user_idx on public.imports (user_id, created_at desc);

alter table public.imports enable row level security;

drop policy if exists imports_own on public.imports;
create policy imports_own on public.imports
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.expenses
  add column if not exists import_id uuid references public.imports(id) on delete cascade;
alter table public.incomes
  add column if not exists import_id uuid references public.imports(id) on delete cascade;
alter table public.investments
  add column if not exists import_id uuid references public.imports(id) on delete cascade;

create index if not exists expenses_import_idx    on public.expenses (import_id);
create index if not exists incomes_import_idx     on public.incomes (import_id);
create index if not exists investments_import_idx on public.investments (import_id);


-- =====================================================================
-- 3. CORREÇÃO DE SEGURANÇA: permissão de alterar só as colunas editáveis
-- =====================================================================
-- O problema, encontrado em 12/09/2026: a política profiles_update_own só
-- conferia "o perfil é seu?", sem restringir coluna. Então quem estava
-- logado podia alterar o PRÓPRIO household_id direto pela API:
--
--   update profiles set household_id = '<id de uma casa>' where id = <eu>
--
-- e entrar numa casa sem convite, furando o limite de 6 e passando a ver os
-- lançamentos de todo mundo. O caso realista: quem SAIU de uma casa conhece
-- o id dela e podia voltar escondido. Convite, validade e limite existiam no
-- banco — e esta porta ficou aberta ao lado deles.
--
-- A correção é privilégio por coluna, que o Postgres aplica ANTES da RLS.
-- Quem está logado só altera o que o app de fato altera. household_id,
-- accent e os campos de aceite passam a mudar só por funções security
-- definer (accept_invite, leave_household, handle_new_user), que validam.
--
-- ATENÇÃO pra quem adicionar coluna editável no futuro: coluna nova NÃO
-- entra nestes grants sozinha. Se a tela precisar editar, acrescente aqui —
-- a falha vai aparecer como "permission denied", não como brecha.

-- profiles: nome, cor, cartão que define o mês, consentimento de recibos.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, color, anchor_card_id, receipts_consent_at)
  on public.profiles to authenticated;

-- households: nome e cor. (id nunca, mesmo que a FK já barrasse.)
revoke update on public.households from anon, authenticated;
grant update (name, color) on public.households to authenticated;

-- household_invites: só revogar. Sem isto um membro podia trocar o código
-- por um previsível ou esticar a validade pra sempre.
revoke update on public.household_invites from anon, authenticated;
grant update (status) on public.household_invites to authenticated;
