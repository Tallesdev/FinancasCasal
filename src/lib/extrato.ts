/**
 * Extrato do banco → gastos (C30). Funções puras, sem React nem Supabase,
 * pra poderem ser testadas sozinhas — igual à planilha.
 *
 * Lê:
 *   • CSV da fatura do cartão Nubank   (date,title,amount)
 *   • CSV do extrato da conta Nubank   (Data,Valor,Identificador,Descrição)
 *   • OFX de qualquer banco (conta ou cartão)
 *   • PDF de qualquer banco (C37): o servidor tira o texto e a IA devolve
 *     as linhas; daqui pra frente é igual aos outros (deLinhasDoPdf)
 *
 * E cruza com o que a pessoa já lançou à mão. O nome quase nunca bate (o
 * "esquinão" vira "DISTRIBUIDORA XYZ LTDA" no extrato), então o que manda é
 * o VALOR exato e a DATA perto. O nome só desempata.
 */

import { detectarSeparador, lerCsv, lerValor, normalizar } from "./planilha";

export type OrigemExtrato =
  | "nubank-cartao"
  | "nubank-conta"
  | "ofx-cartao"
  | "ofx-conta"
  | "pdf-cartao"
  | "pdf-conta";

export const ORIGEM_LABEL: Record<OrigemExtrato, string> = {
  "nubank-cartao": "Fatura do cartão Nubank (CSV)",
  "nubank-conta": "Extrato da conta Nubank (CSV)",
  "ofx-cartao": "Fatura de cartão (OFX)",
  "ofx-conta": "Extrato de conta (OFX)",
  "pdf-cartao": "Fatura de cartão (PDF)",
  "pdf-conta": "Extrato de conta (PDF)",
};

/** Cartão ou conta: decide se o gasto entra como cartão ou como Pix/débito. */
export const ehCartao = (o: OrigemExtrato) =>
  o === "nubank-cartao" || o === "ofx-cartao" || o === "pdf-cartao";

export type TipoLinha =
  /** Saiu dinheiro: é o que vira gasto. */
  | "gasto"
  /** Entrou dinheiro, pagamento recebido na fatura, estorno. Não é gasto. */
  | "entrada"
  /** Pagou a fatura do cartão pela conta: os gastos já estão na fatura. */
  | "fatura";

export type LinhaExtrato = {
  data: string;
  /** Como veio do banco. */
  titulo: string;
  /** O título sem "Compra no débito -", CPF, "Parcela 2/2"… — base da sugestão. */
  limpo: string;
  /** Sempre positivo. */
  valor: number;
  tipo: TipoLinha;
  parcela: { n: number; total: number } | null;
  /** Identidade da linha: é o que impede importar o mesmo extrato duas vezes. */
  ref: string;
};

export type ExtratoLido = { origem: OrigemExtrato; linhas: LinhaExtrato[] };

export class ErroExtrato extends Error {}

// ------------------------------------------------------------------ ler

export function lerExtrato(texto: string): ExtratoLido {
  const t = texto.replace(/^﻿/, "");
  if (/<OFX>|OFXHEADER|<STMTTRN>/i.test(t)) return lerOfx(t);

  const sep = detectarSeparador(t);
  const matriz = lerCsv(t, sep);
  if (matriz.length < 2) throw new ErroExtrato("O arquivo está vazio.");
  const cab = matriz[0].map((c) => normalizar(c));

  // Fatura do cartão Nubank: date,title,amount
  if (cab[0] === "date" && cab.includes("title") && cab.includes("amount")) {
    const iData = cab.indexOf("date");
    const iTitulo = cab.indexOf("title");
    const iValor = cab.indexOf("amount");
    const brutas = matriz.slice(1).map((l) => {
      const valor = lerValor(l[iValor] ?? "");
      const titulo = (l[iTitulo] ?? "").trim();
      // Na fatura, compra vem positiva; pagamento e estorno, negativos.
      return {
        data: dataIso(l[iData] ?? ""),
        titulo,
        valor,
        tipo: (valor ?? 0) > 0 ? ("gasto" as const) : ("entrada" as const),
      };
    });
    return { origem: "nubank-cartao", linhas: comRefs(brutas, "nucard") };
  }

  // Extrato da conta Nubank: Data,Valor,Identificador,Descrição
  if (cab.includes("data") && cab.includes("valor") && cab.some((c) => c.startsWith("descri"))) {
    const iData = cab.indexOf("data");
    const iValor = cab.indexOf("valor");
    const iDesc = cab.findIndex((c) => c.startsWith("descri"));
    const iId = cab.indexOf("identificador");
    const brutas = matriz.slice(1).map((l) => {
      const v = lerValor(l[iValor] ?? "");
      const titulo = (l[iDesc] ?? "").trim();
      const tipo: TipoLinha =
        (v ?? 0) >= 0 ? "entrada" : /pagamento de fatura/i.test(titulo) ? "fatura" : "gasto";
      return {
        data: dataIso(l[iData] ?? ""),
        titulo,
        valor: v === null ? null : Math.abs(v),
        tipo,
        id: iId >= 0 ? (l[iId] ?? "").trim() : "",
      };
    });
    return { origem: "nubank-conta", linhas: comRefs(brutas, "nuconta") };
  }

  throw new ErroExtrato(
    "Não reconheci esse CSV. Por enquanto: fatura do cartão ou extrato da conta do Nubank, ou um OFX de qualquer banco. Pra outras planilhas, use Importar planilha."
  );
}

function lerOfx(t: string): ExtratoLido {
  const cartao = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(t);
  const blocos = t.split(/<STMTTRN>/i).slice(1);
  if (!blocos.length) throw new ErroExtrato("Esse OFX não tem lançamentos.");
  const campo = (b: string, nome: string) => {
    // OFX antigo (SGML) nem sempre fecha a tag: o valor vai até o próximo "<".
    const m = b.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
    return m ? m[1].trim() : "";
  };
  const brutas = blocos.map((b) => {
    const v = lerValor(campo(b, "TRNAMT").replace(",", "."));
    const titulo = (campo(b, "MEMO") || campo(b, "NAME")).replace(/&amp;/g, "&");
    const d = campo(b, "DTPOSTED");
    const tipo: TipoLinha =
      (v ?? 0) >= 0 ? "entrada" : !cartao && /pagamento de fatura|pgto fatura/i.test(titulo) ? "fatura" : "gasto";
    return {
      data: /^\d{8}/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null,
      titulo,
      valor: v === null ? null : Math.abs(v),
      tipo,
      id: campo(b, "FITID"),
    };
  });
  return { origem: cartao ? "ofx-cartao" : "ofx-conta", linhas: comRefs(brutas, "ofx") };
}

/** Uma linha que a leitura do PDF devolveu: valor positivo saiu, negativo entrou. */
export type LinhaDoPdf = { data: string; titulo: string; valor: number };

/**
 * As linhas do PDF (C37) viram o mesmo extrato dos outros formatos. A IA
 * pode escrever o nome um pouco diferente a cada leitura, então a marca da
 * linha é só data + valor (+ ordem): mandar o mesmo PDF de novo não repete.
 */
export function deLinhasDoPdf(cartao: boolean, linhas: LinhaDoPdf[]): ExtratoLido {
  const brutas = linhas.map((l) => ({
    data: dataIso(l.data),
    titulo: l.titulo.trim(),
    valor: Number.isFinite(l.valor) ? Math.abs(l.valor) : null,
    tipo:
      l.valor < 0
        ? ("entrada" as const)
        : !cartao && /pagamento de fatura|pgto fatura|pag fatura/i.test(l.titulo)
          ? ("fatura" as const)
          : ("gasto" as const),
  }));
  return {
    origem: cartao ? "pdf-cartao" : "pdf-conta",
    linhas: comRefs(brutas, "pdf", false),
  };
}

type Bruta = {
  data: string | null;
  titulo: string;
  valor: number | null;
  tipo: TipoLinha;
  id?: string;
};

/**
 * Dá a cada linha uma marca estável. Com id do banco (FITID, Identificador)
 * é ele. Sem id, data + nome + valor + quantas vezes essa mesma linha já
 * apareceu no arquivo — duas "Conveniencia 5,00" no mesmo dia são duas
 * compras, não uma repetida.
 */
function comRefs(brutas: Bruta[], prefixo: string, comTitulo = true): LinhaExtrato[] {
  const vistas = new Map<string, number>();
  const linhas: LinhaExtrato[] = [];
  for (const b of brutas) {
    if (!b.data || b.valor === null || b.valor === 0 || !b.titulo) continue;
    const parcela = lerParcela(b.titulo);
    const base = comTitulo
      ? `${b.data}|${normalizar(b.titulo)}|${b.valor.toFixed(2)}`
      : `${b.data}|${b.valor.toFixed(2)}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    linhas.push({
      data: b.data,
      titulo: b.titulo,
      limpo: limparTitulo(b.titulo),
      valor: b.valor,
      tipo: b.tipo,
      parcela,
      ref: (b.id ? `${prefixo}:${b.id}` : `${prefixo}:${base}|${n}`).slice(0, 300),
    });
  }
  return linhas;
}

/** AAAA-MM-DD, DD/MM/AAAA ou DD/MM/AA. */
function dataIso(bruto: string): string | null {
  const s = bruto.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

export function lerParcela(titulo: string) {
  const m = titulo.match(/parcela\s*(\d+)\s*\/\s*(\d+)/i);
  return m ? { n: Number(m[1]), total: Number(m[2]) } : null;
}

/**
 * "Compra no débito - PADARIA X" → "Padaria X";
 * "Transferência enviada pelo Pix - FULANO - •••.123.456-•• - BANCO" → "Fulano";
 * "Ginato Optica Rr - Parcela 4/4" → "Ginato Optica Rr".
 */
export function limparTitulo(titulo: string) {
  let t = titulo
    .replace(/\s*-\s*parcela\s*\d+\s*\/\s*\d+\s*$/i, "")
    .replace(
      /^(compra no d[eé]bito|compra no cr[eé]dito|transfer[eê]ncia enviada pelo pix|transfer[eê]ncia enviada|pagamento de boleto efetuado|pagamento efetuado|d[eé]bito em conta)\s*-\s*/i,
      ""
    );
  // Depois do nome, o Pix traz documento e banco: fica só o primeiro pedaço.
  t = t.split(/\s+-\s+/)[0];
  t = t.replace(/\s+/g, " ").trim();
  if (!t) t = titulo.trim();
  // Tudo maiúsculo vira "Título Assim"; o resto fica como veio.
  return t === t.toUpperCase()
    ? t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
    : t;
}

/** A chave do apelido aprendido: sem acento, minúsculo, sem números soltos. */
export function chaveDoTitulo(limpo: string) {
  return normalizar(limpo)
    .replace(/[^a-z0-9 ]+/g, " ")
    // "Drogasil1191" e "Drogasil2207" são a mesma rede: o número da loja sai.
    .replace(/([a-z])\d{2,}\b/g, "$1")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// --------------------------------------------------------------- cruzar

/** O que já está lançado e pode ser a mesma compra. */
export type Lancado = {
  /** id do gasto + mês (fixo e parcelado têm um por mês). */
  chave: string;
  expenseId: string;
  descricao: string;
  valor: number;
  /** Gasto avulso: a data. Fixo/parcelado: o mês (AAAA-MM-01). */
  data: string;
  porMes: boolean;
  parcela: number | null;
  /** Parcelado: em quantas vezes (pra conferir com o "Parcela 7/10" do extrato). */
  parcelasTotal?: number | null;
  /**
   * Compra parcelada que a pessoa lançou INTEIRA, de uma vez: o valor é o
   * total, e cada parcela do extrato é um pedaço dele.
   */
  inteira?: boolean;
  categoriaId: string | null;
};

export type Situacao =
  /** Nunca visto: vai ser lançado. */
  | "novo"
  /** Valor igual e data perto de algo já lançado: a pessoa confere. */
  | "parecido"
  /** Essa mesma linha já veio de um extrato antes. */
  | "importado"
  /** Entrada, estorno, pagamento de fatura. */
  | "fora";

export type LinhaCruzada = LinhaExtrato & {
  situacao: Situacao;
  parecidoCom: Lancado | null;
};

/** Diferença em dias entre duas datas AAAA-MM-DD. */
const dias = (a: string, b: string) =>
  Math.round(Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);

const mesDe = (iso: string) => `${iso.slice(0, 7)}-01`;

/** Quantos meses de distância (0 = mesmo mês). */
const meses = (a: string, b: string) =>
  Math.abs(
    (Number(a.slice(0, 4)) - Number(b.slice(0, 4))) * 12 + Number(a.slice(5, 7)) - Number(b.slice(5, 7))
  );

/** Quanto os nomes se parecem, de 0 a 1 (palavras em comum). */
export function semelhanca(a: string, b: string) {
  const palavras = (s: string) =>
    new Set(chaveDoTitulo(s).split(" ").filter((p) => p.length >= 3));
  const pa = palavras(a);
  const pb = palavras(b);
  if (!pa.size || !pb.size) return 0;
  let comuns = 0;
  for (const p of pa) if ([...pb].some((q) => q.startsWith(p) || p.startsWith(q))) comuns++;
  return comuns / Math.min(pa.size, pb.size);
}

/** Folga de datas pra compra avulsa: o banco às vezes lança 1–3 dias depois. */
export const FOLGA_DIAS = 4;

/** Parcela pode diferir uns centavos do que foi lançado (arredondamento da loja). */
export const TOLERANCIA_PARCELA = 0.02;

/** Parcela: até R$ 0,10 ou 2%. Resto: valor exato. */
const toleranciaDe = (l: LinhaExtrato) =>
  l.parcela ? Math.max(0.1, l.valor * TOLERANCIA_PARCELA) : 0.009;

/**
 * Cruza o extrato com o que já existe. Cada lançamento só "casa" com uma
 * linha: duas compras iguais no extrato e uma lançada à mão = uma parecida
 * e uma nova.
 */
export function cruzar(
  linhas: LinhaExtrato[],
  lancados: Lancado[],
  refsImportadas: Set<string>,
  apelidos: Map<string, { description: string }> = new Map()
): LinhaCruzada[] {
  const usados = new Set<string>();
  const saida: LinhaCruzada[] = linhas.map((l) => ({
    ...l,
    situacao:
      l.tipo !== "gasto" ? "fora" : refsImportadas.has(l.ref) ? "importado" : "novo",
    parecidoCom: null,
  }));

  // Pares possíveis, do mais provável pro menos: o par mais forte escolhe primeiro.
  type Par = { i: number; lanc: Lancado; nota: number };
  const pares: Par[] = [];
  saida.forEach((l, i) => {
    if (l.situacao !== "novo") return;
    const nomeDaLinha = apelidos.get(chaveDoTitulo(l.limpo))?.description ?? l.limpo;
    for (const lanc of lancados) {
      let distancia: number;
      if (lanc.inteira) {
        // Lançou a compra inteira: parcela × vezes ≈ total, comprada antes desta parcela.
        if (!l.parcela) continue;
        const total = l.valor * l.parcela.total;
        if (Math.abs(lanc.valor - total) > Math.max(1, total * TOLERANCIA_PARCELA)) continue;
        const antes = meses(lanc.data, mesDe(l.data));
        if (lanc.data > l.data || antes > l.parcela.n + 1) continue;
        distancia = 1;
      } else if (lanc.porMes) {
        // Parcela: a loja divide o total e joga os centavos numa delas
        // (121,50 lançado, 121,49 na fatura). Fixo e avulso: valor exato.
        if (Math.abs(lanc.valor - l.valor) > toleranciaDe(l)) continue;
        const dm = meses(lanc.data, mesDe(l.data));
        // Parcela/fixo: o mesmo mês (ou o vizinho, pela virada da fatura).
        if (dm > 1) continue;
        if (l.parcela && lanc.parcela) {
          if (lanc.parcelasTotal && lanc.parcelasTotal !== l.parcela.total) continue;
          // A data de início que a pessoa usou pode deslocar a contagem em uma.
          if (Math.abs(l.parcela.n - lanc.parcela) > 1) continue;
        }
        distancia = dm * 10 + (l.parcela && lanc.parcela && l.parcela.n !== lanc.parcela ? 3 : 0);
      } else {
        if (Math.abs(lanc.valor - l.valor) > toleranciaDe(l)) continue;
        distancia = dias(lanc.data, l.data);
        if (distancia > FOLGA_DIAS) continue;
      }
      const nota = 100 - distancia * 8 + semelhanca(nomeDaLinha, lanc.descricao) * 30;
      pares.push({ i, lanc, nota });
    }
  });
  pares.sort((a, b) => b.nota - a.nota);
  for (const p of pares) {
    const l = saida[p.i];
    if (l.parecidoCom || usados.has(p.lanc.chave)) continue;
    l.parecidoCom = p.lanc;
    l.situacao = "parecido";
    usados.add(p.lanc.chave);
  }
  return saida;
}
