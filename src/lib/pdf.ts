import { extractText, getDocumentProxy } from "unpdf";

/**
 * Texto de um PDF de recibo. SÓ DO SERVIDOR (C25).
 *
 * Comprovante de banco e nota fiscal eletrônica são PDFs com texto: dá pra
 * ler sem transformar em imagem. PDF escaneado (só imagem) volta vazio, e
 * quem chama avisa que precisa preencher à mão.
 *
 * Só as primeiras páginas e um pedaço do texto: o total do recibo está no
 * começo, e o resto só encareceria a chamada da IA.
 */
const PAGINAS = 3;
const CARACTERES = 6000;

export async function textoDoPdf(dados: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(dados));
  const { text } = await extractText(pdf, { mergePages: false });
  return text
    .slice(0, PAGINAS)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, CARACTERES);
}

/**
 * Texto de uma fatura ou extrato em PDF (C37), já enxuto pra IA: só as
 * linhas que têm valor em reais (os lançamentos) e as que têm data
 * completa ou falam de vencimento/fechamento (de onde sai o ano das
 * compras "13 OUT"). Propaganda, termos e tabelas de juros ficam de fora.
 */
const PAGINAS_EXTRATO = 30;
const CARACTERES_EXTRATO = 24000;

export async function textoDoExtratoPdf(dados: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(dados));
  const { text } = await extractText(pdf, { mergePages: false });
  const linhas = text
    .slice(0, PAGINAS_EXTRATO)
    .join("\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);
  const util = linhas.filter(
    (l, i) =>
      i < 25 ||
      /\d,\d{2}\b/.test(l) ||
      /\b\d{2}\/\d{2}\/\d{2,4}\b/.test(l) ||
      /vencimento|fechamento|per[ií]odo|emiss[aã]o/i.test(l)
  );
  return util.join("\n").slice(0, CARACTERES_EXTRATO);
}
