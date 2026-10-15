/**
 * Lucro e divisão da empresa (FASE_F.md, F3). Conta pura, sem banco.
 *
 * Regras (decisões 4, 5, 6 e 10 do FASE_F.md):
 *  - Lucro do mês = faturado − gastos do mês (faturado = cada parcela no
 *    seu mês, não o que já caiu na conta).
 *  - Mês com prejuízo fecha com prejuízo: não divide e NÃO abate do mês
 *    seguinte. O que fazer com ele é decidido por fora.
 *  - Mês com lucro: primeiro sai a reserva (%), o resto divide pela % de
 *    cada sócio.
 *  - Direito de cada sócio no ano = soma das partes dos meses com lucro.
 *    Falta retirar = direito − retiradas do ano.
 */

export type Parte = { user_id: string; pct: number };

export type MesDividido = {
  mes: string;
  faturou: number;
  gastou: number;
  /** Negativo = prejuízo. */
  lucro: number;
  reserva: number;
  /** Quanto coube a cada sócio no mês (vazio quando teve prejuízo). */
  partes: Record<string, number>;
};

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * A % de cada sócio. Sem divisão salva (ou com sócio novo/que saiu),
 * divide igual entre quem está na empresa hoje.
 */
export function partesValidas(salvas: Parte[], membros: string[]): Parte[] {
  const soDosMembros = salvas.filter((p) => membros.includes(p.user_id));
  const soma = soDosMembros.reduce((t, p) => t + Number(p.pct), 0);
  if (soDosMembros.length === membros.length && Math.abs(soma - 100) < 0.01) {
    return soDosMembros.map((p) => ({ user_id: p.user_id, pct: Number(p.pct) }));
  }
  const igual = membros.length ? 100 / membros.length : 0;
  return membros.map((id) => ({ user_id: id, pct: igual }));
}

export function dividirMes(
  mes: string,
  faturou: number,
  gastou: number,
  reservaPct: number,
  partes: Parte[]
): MesDividido {
  const lucro = centavos(faturou - gastou);
  if (lucro <= 0) return { mes, faturou, gastou, lucro, reserva: 0, partes: {} };

  const reserva = centavos((lucro * reservaPct) / 100);
  const aDividir = lucro - reserva;
  const resultado: Record<string, number> = {};
  // O centavo que sobra do arredondamento vai pro último, pra soma bater.
  let distribuido = 0;
  partes.forEach((p, i) => {
    const valor =
      i === partes.length - 1 ? centavos(aDividir - distribuido) : centavos((aDividir * p.pct) / 100);
    resultado[p.user_id] = valor;
    distribuido = centavos(distribuido + valor);
  });
  return { mes, faturou, gastou, lucro, reserva, partes: resultado };
}

export type ResumoSocio = {
  user_id: string;
  pct: number;
  direito: number;
  retirado: number;
  /** Negativo = retirou mais do que coube até aqui. */
  falta: number;
};

export function resumoDoAno(
  meses: MesDividido[],
  partes: Parte[],
  retiradas: { user_id: string; amount: number }[]
): { socios: ResumoSocio[]; lucroDoAno: number; prejuizoDoAno: number; reservaDoAno: number } {
  const socios = partes.map((p) => {
    const direito = centavos(meses.reduce((t, m) => t + (m.partes[p.user_id] ?? 0), 0));
    const retirado = centavos(
      retiradas.filter((r) => r.user_id === p.user_id).reduce((t, r) => t + Number(r.amount), 0)
    );
    return { user_id: p.user_id, pct: p.pct, direito, retirado, falta: centavos(direito - retirado) };
  });
  return {
    socios,
    lucroDoAno: centavos(meses.filter((m) => m.lucro > 0).reduce((t, m) => t + m.lucro, 0)),
    prejuizoDoAno: centavos(meses.filter((m) => m.lucro < 0).reduce((t, m) => t - m.lucro, 0)),
    reservaDoAno: centavos(meses.reduce((t, m) => t + m.reserva, 0)),
  };
}
