import { r2Configurado } from "@/lib/r2";
import { erro } from "@/lib/rotas";

export { SEM_SESSAO, clienteAdmin, erro, sessao } from "@/lib/rotas";

/**
 * O que as rotas de recibo têm em comum. SÓ DO SERVIDOR.
 */

/**
 * Teto do arquivo que chega no R2. A foto é comprimida no navegador pra
 * algumas centenas de KB (lib/recibos.ts); 3 MB é folga pro caso de a
 * compressão não rodar, não meta.
 */
export const TAMANHO_MAXIMO = 3 * 1024 * 1024;

export const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Recibos só ligam com R2 E a chave secreta do Supabase: é com ela que o
 * servidor marca o envio como conferido (uploaded_at não é editável por
 * quem está logado — migração 009, parte 4).
 */
export function recibosAtivos() {
  return r2Configurado() && Boolean(process.env.SUPABASE_SECRET_KEY);
}

export const DESLIGADO = () =>
  erro("Guardar recibos ainda não está configurado neste app.", 503);

/** Colunas que o navegador recebe. r2_key fica de fora: é detalhe do servidor. */
export const COLUNAS_PUBLICAS =
  "id, expense_id, mime_type, size_bytes, occurred_on, notes, uploaded_at, created_at";
