/**
 * Acerto entre sócios (FASE_F.md, F4). Conta pura, sem banco.
 *
 * Saldo de cada sócio (positivo = os outros devem a ele):
 *   + gastos da empresa que ele pagou do bolso
 *   − recebimentos da empresa que caíram na conta pessoal dele
 *   + acertos que ele pagou
 *   − acertos que ele recebeu
 * A empresa (a conta dela) é a terceira ponta: o saldo dela é o que
 * sobra pra fechar em zero.
 *
 * Retirada de lucro não entra aqui: ela já aparece na tela Lucro.
 */

/** "empresa" = a conta da empresa. */
export type Ponta = string | "empresa";

export const EMPRESA = "empresa" as const;

export type Movimento = { de: Ponta; para: Ponta; valor: number };

// "|| 0" tira o -0, que apareceria como "−R$ 0,00".
const centavos = (v: number) => Math.round(v * 100) / 100 || 0;

export type SaldoSocio = {
  user_id: string;
  pagouDoBolso: number;
  recebeuNaConta: number;
  acertosPagos: number;
  acertosRecebidos: number;
  /** Positivo = tem a receber; negativo = deve. */
  saldo: number;
};

export function saldos(
  socios: string[],
  pagouDoBolso: Record<string, number>,
  recebeuNaConta: Record<string, number>,
  acertos: { from_user: string | null; to_user: string | null; amount: number }[]
): { socios: SaldoSocio[]; empresa: number } {
  const lista = socios.map((id) => {
    const acertosPagos = centavos(
      acertos.filter((a) => a.from_user === id).reduce((t, a) => t + Number(a.amount), 0)
    );
    const acertosRecebidos = centavos(
      acertos.filter((a) => a.to_user === id).reduce((t, a) => t + Number(a.amount), 0)
    );
    const pagou = centavos(pagouDoBolso[id] ?? 0);
    const recebeu = centavos(recebeuNaConta[id] ?? 0);
    return {
      user_id: id,
      pagouDoBolso: pagou,
      recebeuNaConta: recebeu,
      acertosPagos,
      acertosRecebidos,
      saldo: centavos(pagou - recebeu + acertosPagos - acertosRecebidos),
    };
  });
  // A empresa fecha a conta. Acerto com quem saiu da empresa também entra
  // aqui (ele não está mais em `socios`), pelo lado da empresa.
  const empresa = centavos(-lista.reduce((t, s) => t + s.saldo, 0));
  return { socios: lista, empresa };
}

/**
 * As transferências que zeram tudo, no menor número possível: quem mais
 * deve paga primeiro a quem mais tem a receber.
 */
export function paraZerar(saldosPorPonta: { ponta: Ponta; saldo: number }[]): Movimento[] {
  const devedores = saldosPorPonta
    .filter((s) => s.saldo < -0.004)
    .map((s) => ({ ...s, falta: -s.saldo }))
    .sort((a, b) => b.falta - a.falta);
  const credores = saldosPorPonta
    .filter((s) => s.saldo > 0.004)
    .map((s) => ({ ...s, falta: s.saldo }))
    .sort((a, b) => b.falta - a.falta);

  const movimentos: Movimento[] = [];
  let i = 0;
  let j = 0;
  while (i < devedores.length && j < credores.length) {
    const valor = centavos(Math.min(devedores[i].falta, credores[j].falta));
    if (valor > 0) movimentos.push({ de: devedores[i].ponta, para: credores[j].ponta, valor });
    devedores[i].falta = centavos(devedores[i].falta - valor);
    credores[j].falta = centavos(credores[j].falta - valor);
    if (devedores[i].falta <= 0.004) i++;
    if (credores[j].falta <= 0.004) j++;
  }
  return movimentos;
}
