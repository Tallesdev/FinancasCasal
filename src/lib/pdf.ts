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
