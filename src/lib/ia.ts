/**
 * Chamadas de IA, isoladas num lugar só. SÓ DO SERVIDOR: lê GROQ_API_KEY,
 * que nunca pode chegar ao navegador. Importar isto num componente
 * cliente vaza a chave — o Next reclama, mas não confie só nele.
 *
 * Provedores trocam e aposentam modelos com frequência maior que
 * bibliotecas normais. Os nomes ficam em constantes aqui em cima pra
 * trocar de modelo — ou de provedor — sem tocar no resto do app.
 */

const GROQ = "https://api.groq.com/openai/v1";

export const MODELO_TRANSCRICAO = "whisper-large-v3-turbo";
export const MODELO_TEXTO = "llama-3.3-70b-versatile";

export function iaConfigurada() {
  return Boolean(process.env.GROQ_API_KEY);
}

function chave() {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error("GROQ_API_KEY ausente");
  return k;
}

/** Áudio → texto em português. */
export async function transcrever(audio: Blob, nome: string): Promise<string> {
  const form = new FormData();
  form.append("file", audio, nome);
  form.append("model", MODELO_TRANSCRICAO);
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");

  const r = await fetch(`${GROQ}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${chave()}` },
    body: form,
  });

  if (!r.ok) {
    throw new Error(`transcrição ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  const json = (await r.json()) as { text?: string };
  return (json.text ?? "").trim();
}

export type GastoInterpretado = {
  description: string;
  /** Valor de UMA ocorrência, em reais. Nulo se não deu pra entender. */
  amount: number | null;
  /** Nome exato de uma das categorias passadas, ou nulo. */
  category_name: string | null;
  payment_method: "pix" | "card" | null;
};

/**
 * Texto → campos do gasto. Recebe as categorias da pessoa pra tentar casar
 * pelo nome. Devolve sugestão; quem decide é a pessoa, no formulário.
 */
export async function interpretarGasto(
  texto: string,
  categorias: string[]
): Promise<GastoInterpretado> {
  const sistema = [
    "Você extrai UM gasto de uma frase falada em português do Brasil.",
    "Responda SOMENTE um JSON com as chaves:",
    '  description (string curta, sem o valor),',
    "  amount (número em reais, ou null),",
    "  category_name (uma das categorias da lista, exatamente como escrita, ou null),",
    '  payment_method ("pix", "card" ou null — "cartão"/"crédito" = card; "pix"/"débito"/"dinheiro" = pix).',
    "Não invente valor. Se a frase não tem número, amount é null.",
    "Se a categoria não bate com nenhuma da lista, category_name é null.",
    `Categorias da pessoa: ${categorias.length ? categorias.join(", ") : "(nenhuma)"}`,
  ].join("\n");

  const r = await fetch(`${GROQ}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_TEXTO,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: texto },
      ],
    }),
  });

  if (!r.ok) {
    throw new Error(`interpretação ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  const json = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const bruto = json.choices?.[0]?.message?.content ?? "{}";

  let parsed: Partial<GastoInterpretado> = {};
  try {
    parsed = JSON.parse(bruto);
  } catch {
    parsed = {};
  }

  // Sanitiza: a IA pode devolver qualquer coisa; o app só aceita o formato.
  const amount =
    typeof parsed.amount === "number" && Number.isFinite(parsed.amount) && parsed.amount > 0
      ? Math.round(parsed.amount * 100) / 100
      : null;
  const category_name =
    typeof parsed.category_name === "string" &&
    categorias.some((c) => c.toLowerCase() === parsed.category_name!.toLowerCase())
      ? categorias.find((c) => c.toLowerCase() === parsed.category_name!.toLowerCase())!
      : null;
  const payment_method =
    parsed.payment_method === "pix" || parsed.payment_method === "card"
      ? parsed.payment_method
      : null;
  const description =
    typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim().slice(0, 120)
      : texto.slice(0, 120);

  return { description, amount, category_name, payment_method };
}
