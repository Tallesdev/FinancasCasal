import { mesesDe } from "./recebimentos";
import type { Income } from "./types";

/**
 * Lucro por cliente (FASE_F.md, F5.1). Conta pura, sem banco.
 *
 * Faturou = recebimentos do cliente que caem no ano (cada parcela no seu
 * mês, igual ao lucro da empresa). Gastou = gastos marcados com o mesmo
 * cliente no ano. Lucro do trabalho = faturou − gastou.
 *
 * "João", "joao " e "JOÃO" são o mesmo cliente: junta pelo nome sem
 * acento, sem maiúscula e sem espaço sobrando, e mostra o nome mais usado.
 */

export function chaveDoCliente(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type LinhaCliente = {
  chave: string;
  nome: string;
  faturou: number;
  gastou: number;
  lucro: number;
  /** Lucro ÷ faturado, em %. Nulo quando não faturou nada. */
  margem: number | null;
};

const centavos = (v: number) => Math.round(v * 100) / 100 || 0;

export function lucroPorCliente(
  ano: number,
  incomes: Income[],
  gastos: { client: string | null | undefined; amount: number }[]
): { clientes: LinhaCliente[]; semCliente: { faturou: number; gastou: number } } {
  const inicio = `${ano}-01-01`;
  const fim = `${ano}-12-01`;
  const mapa = new Map<string, { nomes: Map<string, number>; faturou: number; gastou: number }>();
  const semCliente = { faturou: 0, gastou: 0 };

  const entrada = (nome: string) => {
    const chave = chaveDoCliente(nome);
    let item = mapa.get(chave);
    if (!item) {
      item = { nomes: new Map(), faturou: 0, gastou: 0 };
      mapa.set(chave, item);
    }
    const limpo = nome.trim().replace(/\s+/g, " ");
    item.nomes.set(limpo, (item.nomes.get(limpo) ?? 0) + 1);
    return item;
  };

  for (const income of incomes) {
    const meses = mesesDe(income, fim).filter((m) => m >= inicio);
    if (!meses.length) continue;
    const valor = meses.length * Number(income.amount);
    if (income.client?.trim()) entrada(income.client).faturou += valor;
    else semCliente.faturou += valor;
  }

  for (const gasto of gastos) {
    if (gasto.client?.trim()) entrada(gasto.client).gastou += Number(gasto.amount);
    else semCliente.gastou += Number(gasto.amount);
  }

  const clientes = Array.from(mapa.entries()).map(([chave, item]) => {
    // O nome mais usado; empate, o primeiro que apareceu.
    const nome = Array.from(item.nomes.entries()).sort((a, b) => b[1] - a[1])[0][0];
    const faturou = centavos(item.faturou);
    const gastou = centavos(item.gastou);
    const lucro = centavos(faturou - gastou);
    return {
      chave,
      nome,
      faturou,
      gastou,
      lucro,
      margem: faturou > 0 ? Math.round((lucro / faturou) * 1000) / 10 : null,
    };
  });

  clientes.sort((a, b) => b.lucro - a.lucro || a.nome.localeCompare(b.nome));
  return {
    clientes,
    semCliente: { faturou: centavos(semCliente.faturou), gastou: centavos(semCliente.gastou) },
  };
}
