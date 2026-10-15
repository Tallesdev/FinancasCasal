-- =====================================================================
-- Migração 019 — Banco mais rápido (FASE_F.md, F8.2, F8.3, F8.4)
--
-- Nenhuma regra de quem vê o quê muda: cada política nova diz exatamente
-- o mesmo que as que ela substitui. Muda só COMO o banco confere.
--
-- F8.2 — `auth.uid()` e `my_household_id()` soltos na política são
-- recalculados linha por linha. Dentro de `(select ...)` o banco calcula
-- uma vez por consulta e reaproveita.
--
-- F8.3 — Leitura com duas ou três políticas (a "_select", a "_select_empresa"
-- e a "_write_own", que por ser FOR ALL também vale pra leitura): o banco
-- testa todas em cada linha. Agora cada tabela tem UMA política de leitura,
-- com as condições juntas por OR, e a de escrita é separada em
-- insert/update/delete (que não entram na leitura).
--
-- F8.4 — Índices nas chaves estrangeiras que não tinham (o painel do
-- Supabase aponta 12). Pesam quando alguém exclui a conta: sem índice, o
-- banco varre a tabela inteira atrás das linhas que apontam pra pessoa.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Escrita: só a própria linha (igual às antigas *_write_own / receipts_own).
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'bank_accounts', 'cards', 'categories', 'expenses',
    'incomes', 'investments', 'receipts'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end $$;

drop policy if exists bank_accounts_write_own on public.bank_accounts;
drop policy if exists cards_write_own on public.cards;
drop policy if exists categories_write_own on public.categories;
drop policy if exists expenses_write_own on public.expenses;
drop policy if exists incomes_write_own on public.incomes;
drop policy if exists investments_write_own on public.investments;
drop policy if exists receipts_own on public.receipts;

-- ---------------------------------------------------------------------
-- Leitura: uma política por tabela.
-- `user_id = eu` continua explícito: household_member_ids() volta vazio
-- se a pessoa estiver sem casa, e as antigas *_write_own garantiam que ela
-- sempre visse o que é dela.
-- ---------------------------------------------------------------------

-- Contas e cartões: os meus; na empresa, os dos sócios também (011).
drop policy if exists bank_accounts_select_own on public.bank_accounts;
drop policy if exists bank_accounts_select_empresa on public.bank_accounts;
drop policy if exists bank_accounts_select on public.bank_accounts;
create policy bank_accounts_select on public.bank_accounts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.minha_casa_e_empresa())
      and user_id in (select public.household_member_ids())
    )
  );

drop policy if exists cards_select_own on public.cards;
drop policy if exists cards_select_empresa on public.cards;
drop policy if exists cards_select on public.cards;
create policy cards_select on public.cards
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.minha_casa_e_empresa())
      and user_id in (select public.household_member_ids())
    )
  );

-- Categorias, gastos, renda e investimentos: todo mundo da casa.
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.household_member_ids())
  );

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.household_member_ids())
  );

drop policy if exists incomes_select on public.incomes;
create policy incomes_select on public.incomes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.household_member_ids())
  );

drop policy if exists investments_select on public.investments;
create policy investments_select on public.investments
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.household_member_ids())
  );

-- Recibos: os meus (inclusive rascunho de envio); na empresa, os dos
-- sócios já enviados (018).
drop policy if exists receipts_select_empresa on public.receipts;
drop policy if exists receipts_select on public.receipts;
create policy receipts_select on public.receipts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      uploaded_at is not null
      and (select public.minha_casa_e_empresa())
      and user_id in (select public.household_member_ids())
    )
  );

-- ---------------------------------------------------------------------
-- Políticas que já eram únicas: só calcular uma vez (F8.2).
-- ---------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select public.household_member_ids())
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists imports_own on public.imports;
create policy imports_own on public.imports
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (id = (select public.my_household_id()));

drop policy if exists households_update on public.households;
create policy households_update on public.households
  for update to authenticated
  using (id = (select public.my_household_id()))
  with check (id = (select public.my_household_id()));

drop policy if exists household_invites_select on public.household_invites;
create policy household_invites_select on public.household_invites
  for select to authenticated
  using (household_id = (select public.my_household_id()));

drop policy if exists household_invites_update on public.household_invites;
create policy household_invites_update on public.household_invites
  for update to authenticated
  using (household_id = (select public.my_household_id()))
  with check (household_id = (select public.my_household_id()));

-- ---------------------------------------------------------------------
-- F8.4 — índices das chaves estrangeiras.
-- ---------------------------------------------------------------------
create index if not exists expenses_paid_by_idx on public.expenses (paid_by);
create index if not exists incomes_received_into_idx on public.incomes (received_into);
create index if not exists household_invites_accepted_by_idx on public.household_invites (accepted_by);
create index if not exists household_invites_created_by_idx on public.household_invites (created_by);
create index if not exists income_received_marked_by_idx on public.income_received (marked_by);
create index if not exists profiles_anchor_card_idx on public.profiles (anchor_card_id);
create index if not exists profit_shares_user_idx on public.profit_shares (user_id);
create index if not exists settlements_created_by_idx on public.settlements (created_by);
create index if not exists settlements_from_user_idx on public.settlements (from_user);
create index if not exists settlements_to_user_idx on public.settlements (to_user);
create index if not exists withdrawals_created_by_idx on public.withdrawals (created_by);
create index if not exists withdrawals_user_idx on public.withdrawals (user_id);

commit;
