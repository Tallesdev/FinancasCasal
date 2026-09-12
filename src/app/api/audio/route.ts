import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { iaConfigurada, interpretarGasto, transcrever } from "@/lib/ia";

export const runtime = "nodejs";

/** 30 s de voz em webm/opus dá ~250 KB. 3 MB é folga, não limite apertado. */
const TAMANHO_MAXIMO = 3 * 1024 * 1024;

/**
 * Áudio → gasto sugerido. O navegador nunca fala com a Groq direto: a
 * chave mora aqui. Exige sessão pra ninguém de fora gastar a cota.
 *
 * Devolve SUGESTÃO. Nada é salvo aqui — quem salva é a pessoa, depois de
 * conferir no formulário. IA erra valor e categoria com frequência normal;
 * deixar salvar sem revisão seria a única forma deste app estragar dado
 * financeiro sem ninguém perceber.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta." }, { status: 401 });
  }

  if (!iaConfigurada()) {
    return NextResponse.json(
      { error: "Lançar por áudio ainda não está configurado neste app." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Áudio não recebido." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Áudio não recebido." }, { status: 400 });
  }
  if (audio.size > TAMANHO_MAXIMO) {
    return NextResponse.json(
      { error: "Áudio grande demais. Fale em até 30 segundos." },
      { status: 413 }
    );
  }

  let categorias: string[] = [];
  try {
    const bruto = form.get("categorias");
    if (typeof bruto === "string") {
      const lista = JSON.parse(bruto);
      if (Array.isArray(lista))
        categorias = lista.filter((c) => typeof c === "string").slice(0, 50);
    }
  } catch {
    categorias = [];
  }

  // A extensão ajuda o Whisper a escolher o decodificador certo.
  const ext = audio.type.includes("mp4") || audio.type.includes("m4a") ? "m4a"
    : audio.type.includes("ogg") ? "ogg"
    : "webm";

  try {
    const texto = await transcrever(audio, `gasto.${ext}`);
    if (!texto) {
      return NextResponse.json(
        { error: "Não deu para entender o áudio. Tente falar mais perto do microfone." },
        { status: 422 }
      );
    }
    const gasto = await interpretarGasto(texto, categorias);
    return NextResponse.json({ texto, gasto });
  } catch (e) {
    // A mensagem amigável fica; o motivo técnico vai junto num campo à
    // parte. Sem isso, "não deu para processar" é indistinguível entre
    // cota estourada, modelo aposentado e formato de áudio recusado — e
    // sem acesso ao log da Vercel não dá pra saber qual foi.
    const motivo = e instanceof Error ? e.message : String(e);
    console.error("[api/audio]", motivo);
    return NextResponse.json(
      {
        error:
          "Não deu para processar o áudio agora. Tente de novo ou digite o gasto.",
        // Nunca contém a chave: transcrever/interpretarGasto só repassam
        // status e corpo da resposta da Groq.
        detalhe: motivo.slice(0, 300),
      },
      { status: 502 }
    );
  }
}
