-- =====================================================================
-- Migração 018 — Recibos da empresa visíveis aos sócios (FASE_F.md, F6.1)
--
-- Na família continua igual: recibo é só de quem enviou (009).
-- Na empresa, o recibo é da empresa: todo sócio VÊ e BAIXA os recibos de
-- todos (inclusive no zip do mês pro contador). Apagar, ligar a gasto e
-- editar continuam só pra quem enviou — a política receipts_own da 009
-- segue valendo pra isso; esta só soma leitura.
--
-- Só recibo com envio concluído (uploaded_at): rascunho de envio não é da
-- conta de ninguém além de quem está enviando.
-- =====================================================================

begin;

drop policy if exists receipts_select_empresa on public.receipts;
create policy receipts_select_empresa on public.receipts
  for select to authenticated
  using (
    uploaded_at is not null
    and (select public.minha_casa_e_empresa())
    and user_id in (select public.household_member_ids())
  );

commit;
