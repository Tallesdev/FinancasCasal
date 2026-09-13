import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2, isolado num lugar só. SÓ DO SERVIDOR: lê as chaves do R2,
 * que nunca podem chegar ao navegador (mesma regra de lib/ia.ts).
 *
 * O R2 fala o protocolo do S3. Em vez do SDK da AWS (pesado), usa aws4fetch,
 * que só faz a assinatura — é o que a própria Cloudflare mostra na
 * documentação do R2.
 *
 * O bucket é privado. Ninguém acessa arquivo por URL fixa: o servidor
 * confere a sessão e assina um link que vale poucos minutos.
 */

/** Tempo de vida dos links assinados. Curto: é só pro envio ou a visualização. */
const VALIDADE_SEGUNDOS = 300;

export function r2Configurado() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

function cliente() {
  if (!r2Configurado()) throw new Error("R2 não configurado");
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    service: "s3",
    region: "auto",
  });
}

function base() {
  return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}`;
}

/** As chaves são `<uuid>/<ano>/<uuid>.<ext>`, mas codifica por garantia. */
function urlDoObjeto(chave: string) {
  return new URL(`${base()}/${chave.split("/").map(encodeURIComponent).join("/")}`);
}

/** Link pro navegador fazer o PUT do arquivo direto no R2. */
export async function assinarEnvio(chave: string, tipo: string) {
  const url = urlDoObjeto(chave);
  url.searchParams.set("X-Amz-Expires", String(VALIDADE_SEGUNDOS));
  const assinado = await cliente().sign(
    new Request(url, { method: "PUT", headers: { "Content-Type": tipo } }),
    { aws: { signQuery: true } }
  );
  return assinado.url;
}

/**
 * Link de leitura. Com `nomeParaBaixar`, o navegador baixa o arquivo com
 * esse nome em vez de abrir.
 */
export async function assinarLeitura(chave: string, nomeParaBaixar?: string) {
  const url = urlDoObjeto(chave);
  url.searchParams.set("X-Amz-Expires", String(VALIDADE_SEGUNDOS));
  if (nomeParaBaixar) {
    url.searchParams.set(
      "response-content-disposition",
      `attachment; filename="${nomeParaBaixar.replace(/[^\w.-]/g, "_")}"`
    );
  }
  const assinado = await cliente().sign(new Request(url, { method: "GET" }), {
    aws: { signQuery: true },
  });
  return assinado.url;
}

/** Tamanho e tipo do objeto, ou nulo se ele não existe. */
export async function infoDoObjeto(chave: string) {
  const r = await cliente().fetch(urlDoObjeto(chave), { method: "HEAD" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 HEAD ${r.status}`);
  return {
    tamanho: Number(r.headers.get("content-length") ?? 0),
    tipo: r.headers.get("content-type") ?? "",
  };
}

/** O arquivo em si — pra leitura por IA, que acontece no servidor. */
export async function baixarObjeto(chave: string) {
  const r = await cliente().fetch(urlDoObjeto(chave));
  if (!r.ok) throw new Error(`R2 GET ${r.status}`);
  return {
    dados: await r.arrayBuffer(),
    tipo: r.headers.get("content-type") ?? "image/jpeg",
  };
}

/** Apagar objeto que não existe não é erro no S3/R2 (responde 204). */
export async function apagarObjeto(chave: string) {
  const r = await cliente().fetch(urlDoObjeto(chave), { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw new Error(`R2 DELETE ${r.status}`);
}

/**
 * Apaga tudo debaixo de um prefixo — é como a exclusão de conta e a
 * retirada do consentimento levam todos os recibos de uma pessoa (`<id>/`).
 * Lista pelo R2, não pelo banco: pega até arquivo cuja linha já sumiu.
 * Devolve quantos apagou.
 */
export async function apagarPrefixo(prefixo: string) {
  if (!/^[0-9a-f-]{36}\/$/.test(prefixo)) {
    // Trava contra apagar o bucket inteiro por um prefixo vazio ou errado.
    throw new Error("prefixo inválido");
  }

  const aws = cliente();
  let apagados = 0;
  let continuacao: string | null = null;

  do {
    const url = new URL(base());
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefixo);
    url.searchParams.set("max-keys", "1000");
    if (continuacao) url.searchParams.set("continuation-token", continuacao);

    const r = await aws.fetch(url);
    if (!r.ok) throw new Error(`R2 LIST ${r.status}`);
    const xml = await r.text();

    const chaves = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => desescapar(m[1]));

    // Em lotes pequenos, pra não abrir centenas de conexões de uma vez.
    for (let i = 0; i < chaves.length; i += 10) {
      await Promise.all(chaves.slice(i, i + 10).map(apagarObjeto));
    }
    apagados += chaves.length;

    continuacao = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? desescapar(xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1] ?? "") || null
      : null;
  } while (continuacao);

  return apagados;
}

function desescapar(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
