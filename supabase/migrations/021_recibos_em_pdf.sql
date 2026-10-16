-- =====================================================================
-- Migração 021 — Recibo em PDF (C25)
--
-- Comprovante de Pix, boleto pago e nota fiscal costumam vir em PDF. A
-- tabela só aceitava foto (JPEG, PNG, WebP); agora aceita PDF também.
-- O tamanho e o conteúdo continuam conferidos no servidor antes de o
-- envio ser marcado como concluído (rotas /api/recibos).
--
-- Seguro num banco com dados: só troca a regra, as linhas não mudam.
-- =====================================================================

alter table public.receipts
  drop constraint if exists receipts_mime_type_check;

alter table public.receipts
  add constraint receipts_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'));
