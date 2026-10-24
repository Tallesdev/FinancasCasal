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

/**
 * Nome escrito no campo Cliente de um gasto que não é de nenhum cliente
 * (C33): "Hot batata" (o restaurante do almoço), ou o cliente escrito de
 * outro jeito ("Cidade jardim" pra "Condomínio Cidade Jardim"). Não entra
 * na lista; o valor conta como gasto sem cliente.
 */
export type NomeSolto = {
  chave: string;
  nome: string;
  gastou: number;
  /** Os clientes que esse nome parece ser (empatados, até 3); vazio se nenhum. */
  parecidos: string[];
};

/** Palavras que não ajudam a reconhecer o cliente. */
const VAZIAS = new Set(["para", "pra", "de", "da", "do", "das", "dos", "e", "condominio", "supermercado", "sup", "loja", "casa", "residencial"]);

const palavras = (chave: string) =>
  chave
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((p) => p.length >= 3);

/**
 * Os clientes que um nome solto parece ser: um contém o outro ("cidade
 * jardim" em "condominio cidade jardim") ou as palavras que importam batem
 * ("sup lima alterosa" ~ "supermercado irmaos lima alterosa"). Empate vem
 * todo (até 3): "Cidade jardim" pode ser "Condomínio Cidade Jardim" ou
 * "Condomínio Residencial Cidade Jardim", e quem escolhe é a pessoa.
 */
export function clientesParecidos(nome: string, clientes: { chave: string; nome: string }[]): string[] {
  const c = chaveDoCliente(nome);
  if (c.length < 3) return [];
  let melhores: string[] = [];
  let nota0 = 0;
  for (const k of clientes) {
    let nota = 0;
    if (k.chave.length >= 4 && (k.chave.includes(c) || c.includes(k.chave))) nota = 1;
    else {
      const a = palavras(c).filter((p) => !VAZIAS.has(p));
      const b = palavras(k.chave);
      if (!a.length) continue;
      const iguais = a.filter((p) => b.some((q) => q === p || (p.length >= 3 && q.startsWith(p)))).length;
      nota = iguais / a.length;
    }
    if (nota < 0.5 || nota < nota0) continue;
    if (nota > nota0) {
      melhores = [];
      nota0 = nota;
    }
    melhores.push(k.nome);
  }
  return melhores.length <= 3 ? melhores : [];
}

export function lucroPorCliente(
  ano: number,
  incomes: Income[],
  gastos: { client: string | null | undefined; amount: number }[],
  /** Clientes cadastrados (app de orçamentos), além dos que têm recebimento. */
  cadastrados: string[] = []
): {
  clientes: LinhaCliente[];
  semCliente: { faturou: number; gastou: number };
  soltos: NomeSolto[];
} {
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

  // Cliente é quem tem recebimento (de qualquer ano) ou está no cadastro.
  // Nome que só aparece em gasto não vira cliente (C33).
  const conhecidos = new Map<string, string>();
  for (const nome of [...incomes.map((i) => i.client ?? ""), ...cadastrados]) {
    const limpo = nome.trim().replace(/\s+/g, " ");
    if (limpo && !conhecidos.has(chaveDoCliente(limpo))) conhecidos.set(chaveDoCliente(limpo), limpo);
  }
  const soltos = new Map<string, { nomes: Map<string, number>; gastou: number }>();

  for (const gasto of gastos) {
    const nome = gasto.client?.trim();
    if (nome && conhecidos.has(chaveDoCliente(nome))) entrada(nome).gastou += Number(gasto.amount);
    else {
      semCliente.gastou += Number(gasto.amount);
      if (nome) {
        const chave = chaveDoCliente(nome);
        const item = soltos.get(chave) ?? { nomes: new Map<string, number>(), gastou: 0 };
        item.nomes.set(nome, (item.nomes.get(nome) ?? 0) + 1);
        item.gastou += Number(gasto.amount);
        soltos.set(chave, item);
      }
    }
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
  const listaConhecidos = Array.from(conhecidos.entries()).map(([chave, nome]) => ({ chave, nome }));
  return {
    clientes,
    semCliente: { faturou: centavos(semCliente.faturou), gastou: centavos(semCliente.gastou) },
    soltos: Array.from(soltos.entries())
      .map(([chave, item]) => {
        const nome = Array.from(item.nomes.entries()).sort((a, b) => b[1] - a[1])[0][0];
        return { chave, nome, gastou: centavos(item.gastou), parecidos: clientesParecidos(nome, listaConhecidos) };
      })
      .sort((a, b) => b.gastou - a.gastou),
  };
}
