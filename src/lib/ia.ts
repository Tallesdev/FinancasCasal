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
 * Modelos com visão, pra ler recibo (Fase E2). Mesma lógica das outras
 * listas: o catálogo depende da conta. Se nenhum existir, "Ler recibo" dá
 * erro e o anexo continua funcionando — as duas coisas são independentes.
 */
export const MODELOS_VISAO = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
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

/**
 * 404 com `model_not_found`: tentar o próximo da lista resolve. Na visão,
 * um modelo que existe mas não aceita imagem responde 400 — também vale
 * tentar o próximo.
 */
function modeloInexistente(status: number, corpo: string) {
  if (status === 404 && corpo.includes("model_not_found")) return true;
  const c = corpo.toLowerCase();
  return status === 400 && c.includes("image") && (c.includes("not support") || c.includes("does not"));
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
  /** Nome exato de um dos cartões passados, ou nulo. */
  card_name: string | null;
  payment_method: "pix" | "card" | null;
};

/**
 * Texto → campos do gasto. Recebe as categorias e os cartões da pessoa pra
 * casar pelo nome em vez de inventar. Devolve sugestão; quem decide é a
 * pessoa, no formulário.
 *
 * Passar os nomes dos cartões é seguro: cartão é privado entre pessoas da
 * casa, não entre a pessoa e o próprio app. Nome de cartão ("Itaú") não é
 * número de cartão.
 */
export async function interpretarGasto(
  texto: string,
  categorias: string[],
  cartoes: string[] = []
): Promise<GastoInterpretado> {
  const sistema = [
    "Você extrai UM gasto de uma frase falada em português do Brasil.",
    "Responda SOMENTE um JSON com as chaves:",
    "  description (string curta, sem o valor),",
    "  amount (número em reais, ou null),",
    "  category_name (uma das categorias da lista, exatamente como escrita, ou null),",
    "  card_name (um dos cartões da lista, exatamente como escrito, ou null),",
    '  payment_method ("pix", "card" ou null — "cartão"/"crédito" = card; "pix"/"débito"/"dinheiro" = pix).',
    "Não invente valor. Se a frase não tem número, amount é null.",
    "Se a categoria não bate com nenhuma da lista, category_name é null.",
    "Se a pessoa disser o nome do cartão (ex: 'no Itaú'), case com a lista.",
    "Se nenhum cartão da lista foi citado, card_name é null.",
    `Categorias da pessoa: ${categorias.length ? categorias.join(", ") : "(nenhuma)"}`,
    `Cartões da pessoa: ${cartoes.length ? cartoes.join(", ") : "(nenhum)"}`,
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
  const card_name =
    typeof parsed.card_name === "string" &&
    cartoes.some((c) => c.toLowerCase() === parsed.card_name!.toLowerCase())
      ? cartoes.find(
          (c) => c.toLowerCase() === parsed.card_name!.toLowerCase()
        )!
      : null;
  // Citar um cartão já diz a forma de pagamento: se a IA acertou o cartão
  // mas escorregou no método, o cartão manda.
  const payment_method = card_name
    ? ("card" as const)
    : parsed.payment_method === "pix" || parsed.payment_method === "card"
      ? parsed.payment_method
      : null;
  const description =
    typeof parsed.description === "string" && parsed.description.trim()
      ? parsed.description.trim().slice(0, 120)
      : texto.slice(0, 120);

  return { description, amount, category_name, card_name, payment_method };
}

export type ReciboLido = {
  /** Estabelecimento ou o que foi comprado, curto. */
  description: string | null;
  /** Total pago, em reais. */
  amount: number | null;
  /** AAAA-MM-DD, só se estiver legível e for uma data plausível. */
  date: string | null;
  /** Nome exato de uma das categorias passadas, ou nulo. */
  category_name: string | null;
};

/**
 * Foto de recibo → campos sugeridos (Fase E2). Mesma regra do áudio: sugere,
 * não salva. Recebe a imagem JÁ comprimida (a que está no R2), que custa
 * menos e lê igual.
 *
 * O prompt pede explicitamente pra NÃO transcrever CPF, endereço ou item de
 * saúde: a IA só precisa devolver quatro campos, e o que ela não devolve
 * não fica guardado em lugar nenhum.
 */
export async function lerRecibo(
  imagem: ArrayBuffer,
  tipo: string,
  categorias: string[]
): Promise<ReciboLido> {
  const sistema = [
    "Você lê a foto de um recibo, nota fiscal ou comprovante brasileiro.",
    "Responda SOMENTE um JSON com as chaves:",
    "  description (nome do estabelecimento ou o que foi comprado, até 60 caracteres, ou null),",
    "  amount (o TOTAL pago, número em reais, ou null),",
    "  date (data da compra no formato AAAA-MM-DD, ou null),",
    "  category_name (uma das categorias da lista, exatamente como escrita, ou null).",
    "Nunca invente: se não estiver legível, use null.",
    "Não inclua CPF, endereço, nome de pessoa, nome de remédio nem dados de cartão em nenhum campo.",
    "Datas brasileiras são dia/mês/ano.",
    `Categorias da pessoa: ${categorias.length ? categorias.join(", ") : "(nenhuma)"}`,
  ].join("\n");

  const dataUrl = `data:${tipo};base64,${Buffer.from(imagem).toString("base64")}`;

  const bruto = await comFallback("leitura de recibo", MODELOS_VISAO, async (modelo) => {
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
          {
            role: "user",
            content: [
              { type: "text", text: "Leia este recibo." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const corpo = (await r.text()).slice(0, 300);
      if (modeloInexistente(r.status, corpo))
        throw new Error(`MODELO_INEXISTENTE: ${modelo} → ${corpo}`);
      throw new Error(`leitura de recibo ${r.status}: ${corpo}`);
    }

    const json = (await r.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? "{}";
  });

  return sanitizarRecibo(bruto, categorias);
}

/** Separado pra dar pra testar sem chamar a IA. */
export function sanitizarRecibo(
  bruto: string,
  categorias: string[],
  hoje = new Date()
): ReciboLido {
  let p: Record<string, unknown> = {};
  try {
    const v = JSON.parse(bruto);
    if (v && typeof v === "object") p = v as Record<string, unknown>;
  } catch {
    p = {};
  }

  const amount =
    typeof p.amount === "number" && Number.isFinite(p.amount) && p.amount > 0 && p.amount < 1e7
      ? Math.round(p.amount * 100) / 100
      : null;

  // Data real, não no futuro (1 dia de folga pro fuso) e não absurda.
  let date: string | null = null;
  if (typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    const [a, m, d] = p.date.split("-").map(Number);
    const dt = new Date(Date.UTC(a, m - 1, d));
    const valida = dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    const limite = hoje.getTime() + 24 * 3600 * 1000;
    if (valida && a >= 2000 && dt.getTime() <= limite) date = p.date;
  }

  const nome = typeof p.category_name === "string" ? p.category_name.toLowerCase() : null;
  const category_name = nome ? categorias.find((c) => c.toLowerCase() === nome) ?? null : null;

  const description =
    typeof p.description === "string" && p.description.trim()
      ? p.description.trim().slice(0, 60)
      : null;

  return { description, amount, date, category_name };
}
