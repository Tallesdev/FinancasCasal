"use client";

import type { Receipt, ReciboLido } from "./types";

/**
 * Recibos do lado do navegador: comprimir, enviar, apagar, ler.
 * As chaves do R2 nunca passam por aqui — só links assinados de minutos.
 */

/** Lado maior da foto depois de comprimir. Recibo continua legível. */
const LADO_MAXIMO = 1600;
/** Se um recibo ficar ilegível, é aqui que se sobe a qualidade. */
const QUALIDADE = 0.75;

export class ErroRecibo extends Error {
  constructor(message: string, readonly detalhe?: string) {
    super(message);
  }
}

/**
 * Foto de celular (3–8 MB) → JPEG de algumas centenas de KB (FASE_E.md §3.4).
 * Roda no aparelho, com canvas. `imageOrientation: "from-image"` respeita a
 * rotação que a câmera grava no EXIF — sem isso, recibo em pé sai deitado.
 */
export async function comprimirImagem(arquivo: File): Promise<Blob> {
  // Vai junto de todo erro daqui: sem isto, "não deu para abrir" não diz
  // NADA sobre o que a foto era, e o problema não dá pra reproduzir.
  const ficha = fichaDoArquivo(arquivo);

  if (!arquivo.type.startsWith("image/")) {
    throw new ErroRecibo("Escolha uma foto.", ficha);
  }

  const imagem = await abrirImagem(arquivo, ficha);

  if (!imagem.width || !imagem.height) {
    imagem.liberar();
    throw new ErroRecibo("Essa foto chegou vazia. Tente escolher outra.", ficha);
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const largura = Math.round(imagem.width * escala);
  const altura = Math.round(imagem.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ErroRecibo("Não deu para preparar a foto.", ficha);
  // JPEG não tem transparência: PNG com fundo transparente ficaria preto.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(imagem.fonte, 0, 0, largura, altura);
  imagem.liberar();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALIDADE)
  );
  // Acontece quando a foto é grande demais pro canvas do aparelho.
  if (!blob) {
    throw new ErroRecibo(
      "Não deu para preparar a foto neste aparelho. Tente uma foto menor.",
      `${ficha} · ${imagem.width}x${imagem.height} → ${largura}x${altura}`
    );
  }

  // Imagem já pequena e já JPEG pode ficar MAIOR ao recomprimir.
  return arquivo.type === "image/jpeg" && arquivo.size <= blob.size ? arquivo : blob;
}

/**
 * createImageBitmap é o caminho rápido; Safari antigo não aceita a opção de
 * orientação e alguns navegadores não abrem HEIC por ele. O <img> é a rede
 * de segurança — e ele também aplica a rotação do EXIF por padrão.
 */
async function abrirImagem(arquivo: File, ficha: string): Promise<{
  fonte: CanvasImageSource;
  width: number;
  height: number;
  liberar: () => void;
}> {
  const falhas: string[] = [];

  if (typeof createImageBitmap === "function") {
    try {
      const b = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
      return { fonte: b, width: b.width, height: b.height, liberar: () => b.close() };
    } catch (e) {
      falhas.push(`bitmap: ${curto(e)}`);
    }
    // Safari antigo recusa a OPÇÃO, não a foto: sem ela, costuma abrir.
    try {
      const b = await createImageBitmap(arquivo);
      return { fonte: b, width: b.width, height: b.height, liberar: () => b.close() };
    } catch (e) {
      falhas.push(`bitmap simples: ${curto(e)}`);
    }
  }

  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      fonte: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      liberar: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    falhas.push(`img: ${curto(e)}`);

    // HEIC é o formato padrão do iPhone ("Alta eficiência"). O Safari abre;
    // Chrome e Android, quase nunca — e o arquivo chega com o tipo vazio ou
    // image/heic, que o canvas não decodifica.
    const pareceHeic =
      /heic|heif/i.test(arquivo.type) || /\.(heic|heif)$/i.test(arquivo.name);

    throw new ErroRecibo(
      pareceHeic
        ? "Este navegador não abre fotos HEIC (o formato padrão do iPhone). Tire a foto pelo próprio app, ou mude em Ajustes → Câmera → Formatos para “Mais compatível”."
        : "Não deu para abrir essa foto neste aparelho. Tente tirar a foto de novo ou escolher outra.",
      `${ficha} · ${falhas.join(" | ")}`
    );
  }
}

/** O que a foto era, em uma linha: é o que a pessoa consegue me mandar num print. */
function fichaDoArquivo(arquivo: File) {
  const ext = arquivo.name.includes(".") ? arquivo.name.split(".").pop() : "sem extensão";
  return `${arquivo.type || "tipo vazio"} · .${ext} · ${Math.round(arquivo.size / 1024)} KB`;
}

const curto = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 80);

async function lerErro(r: Response, padrao: string): Promise<ErroRecibo> {
  try {
    const j = (await r.json()) as { error?: string; detalhe?: string };
    return new ErroRecibo(j.error ?? padrao, j.detalhe);
  } catch {
    return new ErroRecibo(padrao, `HTTP ${r.status}`);
  }
}

/**
 * Os três passos do envio (FASE_E.md §3.1):
 *   1. o servidor cria a linha e assina um link de envio;
 *   2. o navegador sobe o arquivo direto no R2;
 *   3. o servidor confere que chegou.
 */
export async function enviarRecibo({
  arquivo,
  data,
  expenseId,
}: {
  arquivo: File;
  data: string;
  expenseId?: string | null;
}): Promise<Receipt> {
  const foto = await comprimirImagem(arquivo);

  const r1 = await fetch("/api/recibos/assinar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: foto.type || "image/jpeg",
      tamanho: foto.size,
      data,
      expense_id: expenseId ?? null,
    }),
  });
  if (!r1.ok) throw await lerErro(r1, "Não deu para preparar o envio.");
  const { recibo, url } = (await r1.json()) as { recibo: Receipt; url: string };

  try {
    const r2 = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": foto.type || "image/jpeg" },
      body: foto,
    });
    if (!r2.ok) throw new ErroRecibo("Não deu para enviar a foto.", `R2 ${r2.status}`);
  } catch (e) {
    // Envio não chegou: apaga a linha pra não ficar "não concluído" à toa.
    await apagarRecibo(recibo.id).catch(() => {});
    if (e instanceof ErroRecibo) throw e;
    // TypeError aqui é quase sempre CORS do bucket (FASE_E.md §2, item 4)
    // ou falta de sinal — o navegador não diferencia os dois.
    throw new ErroRecibo(
      "Não deu para enviar a foto. Confira a conexão e tente de novo.",
      e instanceof Error ? e.message : String(e)
    );
  }

  return confirmarEnvio(recibo.id);
}

/** Passo 3. Também serve pra reconferir um envio que ficou pela metade. */
export async function confirmarEnvio(id: string): Promise<Receipt> {
  const r = await fetch(`/api/recibos/${id}/confirmar`, { method: "POST" });
  if (!r.ok) throw await lerErro(r, "Não deu para concluir o envio.");
  return ((await r.json()) as { recibo: Receipt }).recibo;
}

export async function apagarRecibo(id: string) {
  const r = await fetch(`/api/recibos/${id}`, { method: "DELETE" });
  if (!r.ok) throw await lerErro(r, "Não deu para apagar o recibo.");
}

export async function lerReciboComIA(id: string, categorias: string[]): Promise<ReciboLido> {
  const r = await fetch(`/api/recibos/${id}/ler`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categorias }),
  });
  if (!r.ok) throw await lerErro(r, "Não deu para ler o recibo.");
  return ((await r.json()) as { leitura: ReciboLido }).leitura;
}

export const urlDoRecibo = (id: string, baixar = false) =>
  `/api/recibos/${id}/arquivo${baixar ? "?baixar=1" : ""}`;

export function tamanhoLegivel(bytes: number | null) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
