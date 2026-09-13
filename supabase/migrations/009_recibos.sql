-- =====================================================================
-- Migração 009 — Recibos (Fase E)
-- Spec: FASE_E.md.
--
-- Roda DEPOIS da 008. Seguro num banco com dados: só cria coisa nova.
-- Não altera nem apaga nenhuma tabela existente.
-- =====================================================================


-- =====================================================================
-- 1. Tabela
-- =====================================================================
-- Uma linha por foto. O arquivo mora no Cloudflare R2; aqui fica o que diz
-- que ele existe, de quem é e a que gasto pertence.
--
-- A linha nasce ANTES do upload (quem cria é a rota que assina o envio), com
-- uploaded_at nulo. O servidor só preenche uploaded_at depois de conferir no
-- R2 que o arquivo chegou e tem tamanho aceitável. Assim nunca existe arquivo
-- no R2 sem linha no banco — o pior caso é o contrário, uma linha "envio não
-- concluído", que aparece na tela e pode ser apagada. (FASE_E.md §3.7)

create table if not exists public.receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Nulo é normal: a foto pode subir antes do gasto existir, e pode ficar
  -- solta de propósito ("tenho o comprovante, lanço depois").
  expense_id   uuid references public.expenses(id) on delete set null,
  r2_key       text not null unique,
  mime_type    text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes   int,
  -- A data que importa é a do gasto, não a do upload: é por ela que a tela
  -- do imposto agrupa.
  occurred_on  date not null default current_date,
  notes        text check (char_length(notes) <= 500),
  -- Nulo = assinado mas o servidor ainda não confirmou que o arquivo chegou.
  uploaded_at  timestamptz,
  created_at   timestamptz not null default now(),

  -- O arquivo de uma pessoa sempre mora debaixo do id dela no R2. Sem esta
  -- trava, alguém poderia criar uma linha apontando pra chave de OUTRA
  -- pessoa e pedir ao servidor um link de leitura pra ela.
  constraint receipts_chave_do_dono check (r2_key like user_id::text || '/%')
);

create index if not exists receipts_user_idx    on public.receipts (user_id, occurred_on);
create index if not exists receipts_expense_idx on public.receipts (expense_id);


-- =====================================================================
-- 2. Recibo só se liga a gasto da própria pessoa
-- =====================================================================
-- A chave estrangeira não passa pela RLS: sem isto, daria pra ligar um
-- recibo ao gasto de outra pessoa da casa.

create or replace function public.receipts_gasto_do_dono()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.expense_id is not null and not exists (
    select 1 from public.expenses e
    where e.id = new.expense_id and e.user_id = new.user_id
  ) then
    raise exception 'O recibo só pode ser ligado a um gasto seu.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists receipts_gasto_do_dono on public.receipts;
create trigger receipts_gasto_do_dono
  before insert or update of expense_id on public.receipts
  for each row execute function public.receipts_gasto_do_dono();


-- =====================================================================
-- 3. RLS: privado como cartão
-- =====================================================================
-- Recibo é prova de gasto de uma pessoa só — nem na visão "todos" da casa
-- o outro vê. Mesma regra de cards e bank_accounts.

alter table public.receipts enable row level security;

drop policy if exists receipts_own on public.receipts;
create policy receipts_own on public.receipts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- =====================================================================
-- 4. Permissão por coluna (mesma lição da 008, parte 3)
-- =====================================================================
-- Quem está logado cria a linha e edita gasto ligado, data e observação.
-- uploaded_at e size_bytes só o servidor preenche, depois de conferir o
-- arquivo no R2. user_id vem do default (auth.uid()), nunca do pedido.

revoke all on public.receipts from anon;
revoke insert, update on public.receipts from authenticated;
grant insert (expense_id, r2_key, mime_type, occurred_on, notes)
  on public.receipts to authenticated;
grant update (expense_id, occurred_on, notes)
  on public.receipts to authenticated;
