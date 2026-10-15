-- =====================================================================
-- Migração 012 — O convite diz se é casa ou empresa (FASE_F.md, F1.2)
--
-- Depende da 010 (households.kind). get_invite ganha household_kind, pra
-- página do convite avisar quando a conta de quem entra é de outro tipo.
-- O resto da função é idêntico ao da 006.
--
-- Mudar o tipo de retorno exige recriar a função; os grants voltam iguais
-- (anon e authenticated: o convite é aberto antes de ter sessão).
-- =====================================================================

begin;

drop function if exists public.get_invite(text);

create function public.get_invite(p_token text)
returns table (
  household_name  text,
  inviter_name    text,
  inviter_color   text,
  member_count    bigint,
  expires_at      timestamptz,
  email_locked    boolean,
  household_kind  public.household_kind
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.name,
    p.display_name,
    p.color,
    (select count(*) from public.profiles where household_id = i.household_id),
    i.expires_at,
    i.invited_email is not null,
    h.kind
  from public.household_invites i
  join public.households h on h.id = i.household_id
  join public.profiles   p on p.id = i.created_by
  where (i.token = p_token or i.code = upper(replace(p_token, '-', '')))
    and i.status = 'pending'
    and i.expires_at > now();
$$;

grant execute on function public.get_invite(text) to anon, authenticated;

commit;
