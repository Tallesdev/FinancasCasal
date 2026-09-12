/**
 * O que termos, política e cadastro precisam concordar entre si: qual versão
 * está valendo, quem responde pelos dados, a idade mínima. Num lugar só pra
 * que as três telas nunca digam coisas diferentes.
 *
 * RASCUNHO: os textos de /privacidade e /termos foram escritos por IA a
 * partir do que o app faz de verdade, conferido no código e no banco. Não
 * são peça jurídica. Revisar com profissional antes de divulgar amplamente.
 */

/** Muda quando termos ou política mudam. Fica gravado no aceite do cadastro. */
export const TERMOS_VERSAO = "2026-09-12";

/**
 * Quem responde pelos dados e como falar com essa pessoa. Vem de variável de
 * ambiente de propósito: o repositório é público, e e-mail pessoal não deve
 * ir parar no histórico do git. Na página ele aparece — é o objetivo de um
 * contato —, mas essa exposição é escolha de quem configura, não do código.
 */
export const RESPONSAVEL = process.env.NEXT_PUBLIC_RESPONSAVEL_NOME ?? "";
export const CONTATO_EMAIL = process.env.NEXT_PUBLIC_CONTATO_EMAIL ?? "";

export const IDADE_MINIMA = 18;

/**
 * Idade em anos completos a partir de "AAAA-MM-DD". Compara ano, mês e dia
 * como números em vez de montar um Date — montar Date a partir de string só
 * com data cai em UTC e erra por um dia no Brasil, justo no aniversário.
 *
 * Devolve null pra data inválida ou impossível (futuro, mais de 120 anos).
 */
export function idadeEm(nascimento: string, hoje = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nascimento);
  if (!m) return null;

  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const mesHoje = hoje.getMonth() + 1;
  const diaHoje = hoje.getDate();

  let idade = hoje.getFullYear() - ano;
  if (mesHoje < mes || (mesHoje === mes && diaHoje < dia)) idade -= 1;

  if (idade < 0 || idade > 120) return null;
  return idade;
}
