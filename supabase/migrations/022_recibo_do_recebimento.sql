-- =====================================================================
-- Migração 022 — Comprovante no recebimento (C26)
--
-- O recibo já podia ser ligado a um gasto (expense_id). Agora pode ser
-- ligado a um recebimento também: o comprovante do Pix, do boleto ou da
-- transferência que o cliente mandou. Um recibo é de um lançamento só —
-- gasto OU recebimento, nunca os dois.
--
-- Mesmas travas do gasto (migração 009): só se liga a um recebimento seu,
-- e quem está logado só escreve as colunas liberadas.
--
-- Seguro num banco com dados: só cria coisa nova. Os recibos que existem
-- ficam com income_id nulo.
-- =====================================================================

alter table public.receipts
  add column if not exists income_id uuid references public.incomes(id) on delete set null;

create index if not exists receipts_income_idx on public.receipts (income_id);

alter table public.receipts
  drop constraint if exists receipts_um_lancamento;
alter table public.receipts
  add constraint receipts_um_lancamento check (num_nonnulls(expense_id, income_id) <= 1);

-- Igual à receipts_gasto_do_dono da 009: sem isto, dava pra pendurar um
-- recibo seu no recebimento de outra pessoa.
create or replace function public.receipts_recebimento_do_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.income_id is not null and not exists (
    select 1 from public.incomes i
    where i.id = new.income_id and i.user_id = new.user_id
  ) then
    raise exception 'O recibo só pode ser ligado a um recebimento seu.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_recebimento_do_dono on public.receipts;
create trigger receipts_recebimento_do_dono
  before insert or update of income_id on public.receipts
  for each row execute function public.receipts_recebimento_do_dono();

grant insert (income_id) on public.receipts to authenticated;
grant update (income_id) on public.receipts to authenticated;
