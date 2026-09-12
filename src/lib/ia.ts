/**
 * Chamadas de IA, isoladas num lugar só. SÓ DO SERVIDOR: lê GROQ_API_KEY,
 * que nunca pode chegar ao navegador. Importar isto num componente
 * cliente vaza a chave — o Next reclama, mas não confie só nele.
 */

const GROQ = "https://api.groq.com/openai/v1";

/**
 * Modelos em ordem de preferência, não um só.
 *
 * O primeiro teste em produção falhou com 404 `model_not_found` no
 * `llama-3.3-70b-versatile` — ele está na documentação como modelo de
 * produção, mas a chave não tinha acesso (contas novas no plano grátis
 * costumam ver um subconjunto menor). Em vez de adivinhar qual nome a
 * conta enxerga, o código tenta em ordem e cai pro próximo quando o
 * modelo não existe. De quebra, sobrevive a modelo aposentado sem
 * precisar de deploy.
 *
 * O último de cada lista é o mais básico — o que tem mais chance de
 * existir em qualquer conta.
 */
export const MODELOS_TRANSCRICAO = [
  "whisper-large-v3-turbo",
  "whisper-large-v3",
];

export const MODELOS_TEXTO = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

/**
 * Qual modelo funcionou nesta instância. Serverless recicla, então isto
 * some de tempos em tempos — mas dentro de uma instância quente evita
 * repetir a tentativa que já se sabe que falha.
 */
const funcionou = new Map<string, string>();

export function iaConfigurada() {
  return Boolean(process.env.GROQ_API_KEY);
}

function chave() {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error("GROQ_API_KEY ausente");
  return k;
}

/** 404 com `model_not_found`: tentar o próximo da lista resolve. */
function modeloInexistente(status: number, corpo: string) {
  return status === 404 && corpo.includes("model_not_found");
}

/**
 * Roda `tentar` com cada modelo da lista até um funcionar. Só engole o
 * erro de "modelo não existe" — qualquer outro (cota, chave inválida,
 * áudio recusado) estoura na hora, porque trocar de modelo não ajudaria.
 */
async function comFallback<T>(
  tipo: string,
  modelos: string[],
  tentar: (modelo: string) => Promise<T>
): Promise<T> {
  const preferido = funcionou.get(tipo);
  const ordem = preferido
    ? [preferido, ...modelos.filter((m) => m !== preferido)]
    : modelos;

  let ultimoErro = "";

  for (const modelo of ordem) {
    try {
      const resultado = await tentar(modelo);
      funcionou.set(tipo, modelo);
      return resultado;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // O marcador é posto por quem chama, que conhece status e corpo.
      if (!msg.startsWith("MODELO_INEXISTENTE:")) throw e;
      ultimoErro = msg.replace("MODELO_INEXISTENTE:", "").trim();
    }
  }

  throw new Error(
    `${tipo}: nenhum modelo disponível para esta chave (tentados: ${ordem.join(", ")}). Último: ${ultimoErro}`
  );
}

/** Áudio → texto em português. */
export async function transcrever(audio: Blob, nome: string): Promise<string> {
  return comFallback("transcrição", MODELOS_TRANSCRICAO, async (modelo) => {
    const form = new FormData();
    form.append("file", audio, nome);
    form.append("model", modelo);
    form.append("language", "pt");
    form.append("response_format", "json");
    form.append("temperature", "0");

    const r = await fetch(`${GROQ}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave()}` },
      body: form,
    });

    if (!r.ok) {
      const corpo = (await r.text()).slice(0, 300);
      if (modeloInexistente(r.status, corpo))
        throw new Error(`MODELO_INEXISTENTE: ${modelo} → ${corpo}`);
      throw new Error(`transcrição ${r.status}: ${corpo}`);
    }

    const json = (await r.json()) as { text?: string };
    return (json.text ?? "").trim();
  });
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
    "  description (string curta, sem o valor),",
    "  amount (número em reais, ou null),",
    "  category_name (uma das categorias da lista, exatamente como escrita, ou null),",
    '  payment_method ("pix", "card" ou null — "cartão"/"crédito" = card; "pix"/"débito"/"dinheiro" = pix).',
    "Não invente valor. Se a frase não tem número, amount é null.",
    "Se a categoria não bate com nenhuma da lista, category_name é null.",
    `Categorias da pessoa: ${categorias.length ? categorias.join(", ") : "(nenhuma)"}`,
  ].join("\n");

  const bruto = await comFallback("interpretação", MODELOS_TEXTO, async (modelo) => {
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sistema },
          { role: "user", content: texto },
        ],
      }),
    });

    if (!r.ok) {
      const corpo = (await r.text()).slice(0, 300);
      if (modeloInexistente(r.status, corpo))
        throw new Error(`MODELO_INEXISTENTE: ${modelo} → ${corpo}`);
      throw new Error(`interpretação ${r.status}: ${corpo}`);
    }

    const json = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? "{}";
  });

  let parsed: Partial<GastoInterpretado> = {};
  try {
    parsed = JSON.parse(bruto);
  } catch {
    parsed = {};
  }

  // Sanitiza: a IA pode devolver qualquer coisa; o app só aceita o formato.
  const amount =
    typeof parsed.amount === "number" &&
    Number.isFinite(parsed.amount) &&
    parsed.amount > 0
      ? Math.round(parsed.amount * 100) / 100
      : null;
  const category_name =
    typeof parsed.category_name === "string" &&
    categorias.some(
      (c) => c.toLowerCase() === parsed.category_name!.toLowerCase()
    )
      ? categorias.find(
          (c) => c.toLowerCase() === parsed.category_name!.toLowerCase()
        )!
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
