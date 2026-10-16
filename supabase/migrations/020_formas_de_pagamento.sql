-- =====================================================================
-- Migração 020 — Mais formas de pagamento (C24)
--
-- Gasto: além de Pix e Cartão, agora Dinheiro, Boleto e Cheque.
-- Recebimento: passa a guardar como o cliente pagou (as mesmas cinco).
--
-- Nada muda no que já existe: os gastos continuam pix/card, e os
-- recebimentos antigos ficam com a forma em branco (nulo = não informado).
-- As funções que separam cartão do resto (fatura, janela do cartão)
-- comparam só com 'card', então as formas novas entram no "resto".
--
-- ADD VALUE fica fora de transação explícita: dentro de uma, o valor novo
-- só pode ser usado depois do commit — e aqui ninguém usa ainda.
-- =====================================================================

alter type public.payment_method add value if not exists 'cash';
alter type public.payment_method add value if not exists 'boleto';
alter type public.payment_method add value if not exists 'check';

alter table public.incomes
  add column if not exists payment_method public.payment_method;

comment on column public.incomes.payment_method is
  'Como o cliente pagou (pix, card, cash, boleto, check). Nulo = não informado.';
