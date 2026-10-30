import { NextResponse } from "next/server";
import { iaConfigurada, lerExtratoPdf } from "@/lib/ia";
import { textoDoExtratoPdf } from "@/lib/pdf";
import { SEM_SESSAO, erro, sessao } from "@/lib/rotas";

export const runtime = "nodejs";
export const maxDuration = 60;

const TAMANHO_MAXIMO = 5 * 1024 * 1024;

/**
 * Fatura ou extrato em PDF → linhas (C37). Só lê: devolve as linhas pra
 * tela, que cruza com o que já foi lançado e deixa a pessoa conferir antes
 * de importar. Nada é salvo aqui, e o PDF não fica guardado.
 */
export async function POST(request: Request) {
  const s = await sessao();
  if (!s) return SEM_SESSAO();
  if (!iaConfigurada()) return erro("Ler extrato em PDF ainda não está configurado neste app.", 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return erro("Arquivo não recebido.", 400);
  }
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof Blob) || arquivo.size === 0) return erro("Arquivo não recebido.", 400);
  if (arquivo.size > TAMANHO_MAXIMO) return erro("Arquivo grande demais (máximo 5 MB).", 413);

  const dados = await arquivo.arrayBuffer();
  if (new TextDecoder().decode(dados.slice(0, 5)) !== "%PDF-") return erro("Esse arquivo não é um PDF.", 400);

  let texto: string;
  try {
    texto = await textoDoExtratoPdf(dados);
  } catch (e) {
    // PDF com senha cai aqui (alguns bancos protegem a fatura com o CPF).
    return erro("Não deu para abrir esse PDF. Se ele tem senha, baixe de novo sem senha, ou mande o CSV/OFX.", 422, String(e));
  }
  if (texto.replace(/\s/g, "").length < 40)
    return erro("Esse PDF é só imagem (escaneado), sem texto pra ler. Mande o CSV ou o OFX do banco.", 422);

  try {
    const lido = await lerExtratoPdf(texto);
    if (!lido.linhas.length) return erro("Não achei lançamentos nesse PDF.", 422);
    return NextResponse.json(lido);
  } catch (e) {
    return erro("Não deu para ler esse PDF agora. Tente de novo em um minuto.", 502, String(e));
  }
}
