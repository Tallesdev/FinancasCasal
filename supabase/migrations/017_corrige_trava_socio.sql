-- =====================================================================
-- Migração 017 — Corrige a trava de sócio da 016 (FASE_F.md, C15)
--
-- O erro: a mesma função serve a gastos e recebimentos e lia
-- new.paid_by e new.received_into num CASE. O PL/pgSQL resolve os dois
-- campos, e o registro de gasto não tem received_into (nem o de
-- recebimento tem paid_by) → "record new has no field ..." em TODO
-- gasto e recebimento novo, de qualquer conta, desde a 016.
--
-- A correção lê o campo pelo nome via to_jsonb(new), que não quebra
-- quando o campo não existe. Aplicada direto em produção em 15/10 e
-- conferida (gasto e recebimento voltaram a gravar; pessoa de fora
-- continua recusada).
-- =====================================================================

create or replace function public.confere_socio_do_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pessoa uuid := (to_jsonb(new) ->> case tg_table_name when 'expenses' then 'paid_by' else 'received_into' end)::uuid;
begin
  if v_pessoa is not null and not exists (
    select 1
    from public.profiles alvo
    join public.profiles dono on dono.household_id = alvo.household_id
    where alvo.id = v_pessoa and dono.id = new.user_id
  ) then
    raise exception 'Só dá pra indicar um sócio da mesma empresa.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
