/**
 * Ler e escrever planilha — funções puras, sem React nem Supabase, pra
 * poderem ser testadas sozinhas. É aqui que mora o risco da importação:
 * trocar dia com mês, ou ler "1.500" como um e meio.
 *
 * Só CSV, de propósito. Excel e Google Planilhas exportam CSV em dois
 * cliques, e ler .xlsx exigiria uma biblioteca — a mais usada tem falhas de
 * segurança conhecidas na versão publicada no npm. Não vale trazer isso pra
 * dentro do app pra poupar um "Salvar como".
 *
 * O CSV que o Excel em português salva tem três armadilhas, todas tratadas:
 * separador ";" em vez de ",", vírgula decimal, e codificação Windows-1252
 * em vez de UTF-8 (acentos viram lixo se lidos errado).
 */

// ---------------------------------------------------------------------
// Ler o arquivo
// ---------------------------------------------------------------------

/**
 * UTF-8 (com ou sem BOM) ou, se não for UTF-8 válido, Windows-1252 — o
 * padrão do Excel em português. O modo `fatal` é o que distingue os dois:
 * Windows-1252 com acento não é UTF-8 válido e faz o decoder estourar.
 */
export function decodificar(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true })
      .decode(buffer)
      .replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** O separador que mais aparece fora de aspas na primeira linha com conteúdo. */
export function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim()) ?? "";
  const contar = (sep: string) => {
    let n = 0;
    let aspas = false;
    for (const c of primeira) {
      if (c === '"') aspas = !aspas;
      else if (c === sep && !aspas) n++;
    }
    return n;
  };
  const candidatos = [";", ",", "\t"];
  return candidatos.reduce((melhor, sep) =>
    contar(sep) > contar(melhor) ? sep : melhor
  );
}

/**
 * CSV → matriz de strings. Trata aspas, aspas escapadas ("") e quebra de
 * linha dentro de aspas. Descarta linhas totalmente vazias.
 */
export function lerCsv(texto: string, sep: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------
// Valores
// ---------------------------------------------------------------------

/**
 * "R$ 1.234,56", "-87,50", "(87,50)", "1234.56", "87,5" → número.
 *
 * Regras, na ordem:
 *  • vírgula E ponto: o que vem por último é o decimal;
 *  • só vírgula: decimal (padrão brasileiro), exceto se houver várias;
 *  • só ponto: "1.234" e "1.234.567" são milhar; "87.5" e "87.50" decimal.
 *
 * A ambiguidade real é "1.500" (mil e quinhentos aqui, um e meio nos EUA).
 * A escolha é a brasileira — e a prévia mostra o valor lido antes de
 * importar, pra pessoa pegar se a planilha for de outro padrão.
 */
export function lerValor(bruto: string): number | null {
  let s = bruto.trim();
  if (!s) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/r\$/i, "").replace(/[\s ]/g, "");

  if (s.startsWith("-")) {
    negativo = !negativo;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negativo = !negativo;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);

  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  let normal: string;

  if (virgula >= 0 && ponto >= 0) {
    normal =
      virgula > ponto
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (virgula >= 0) {
    normal =
      (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (ponto >= 0) {
    const grupos = s.split(".");
    const milhar = grupos.length > 2 || grupos[grupos.length - 1].length === 3;
    normal = milhar ? s.replace(/\./g, "") : s;
  } else {
    normal = s;
  }

  const n = Number(normal);
  if (!Number.isFinite(n)) return null;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

// ---------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------

export type OrdemData = "dmy" | "mdy";

const DATA_BARRA = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/;
const DATA_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/**
 * Olha a coluna INTEIRA pra decidir dia/mês ou mês/dia — uma data sozinha
 * como 03/04/2026 não diz nada. Basta uma linha com 13 ou mais na primeira
 * posição pra saber que é dia/mês.
 *
 *  • ambiguo: nenhuma linha decidiu (tudo ≤ 12). Assume dia/mês e a tela avisa.
 *  • conflito: há linhas dos dois jeitos. A planilha está misturada; a
 *    importação não deve seguir sem a pessoa corrigir.
 */
export function detectarOrdem(valores: string[]): {
  ordem: OrdemData;
  ambiguo: boolean;
  conflito: boolean;
} {
  let diaPrimeiro = false;
  let mesPrimeiro = false;

  for (const v of valores) {
    const m = DATA_BARRA.exec(somenteData(v));
    if (!m) continue;
    if (Number(m[1]) > 12) diaPrimeiro = true;
    if (Number(m[2]) > 12) mesPrimeiro = true;
  }

  return {
    ordem: mesPrimeiro && !diaPrimeiro ? "mdy" : "dmy",
    ambiguo: !diaPrimeiro && !mesPrimeiro,
    conflito: diaPrimeiro && mesPrimeiro,
  };
}

/** "12/09/2026 14:30" → "12/09/2026". Planilha às vezes traz a hora junto. */
function somenteData(v: string) {
  return v.trim().split(/[\sT]/)[0] ?? "";
}

/**
 * Data da planilha → "AAAA-MM-DD", ou null se não for uma data real.
 * Aceita dia/mês/ano com /, . ou -, ano com 2 ou 4 dígitos, e ISO.
 * 31/02 é recusado: monta a data e confere se ela voltou igual.
 */
export function lerData(bruto: string, ordem: OrdemData): string | null {
  const s = somenteData(bruto);
  if (!s) return null;

  let ano: number;
  let mes: number;
  let dia: number;

  const iso = DATA_ISO.exec(s);
  const barra = DATA_BARRA.exec(s);

  if (iso) {
    ano = Number(iso[1]);
    mes = Number(iso[2]);
    dia = Number(iso[3]);
  } else if (barra) {
    const a = Number(barra[1]);
    const b = Number(barra[2]);
    ano = Number(barra[3]);
    if (barra[3].length === 2) ano += ano < 70 ? 2000 : 1900;
    [dia, mes] = ordem === "dmy" ? [a, b] : [b, a];
  } else {
    return null;
  }

  const d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia)
    return null;

  const p = (n: number) => String(n).padStart(2, "0");
  return `${ano}-${p(mes)}-${p(dia)}`;
}

// ---------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------

export type Campo = "data" | "descricao" | "valor" | "categoria" | "cartao" | "tipo";

/** Minúsculo, sem acento, sem "(r$)", espaços colapsados. */
export function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(r\$\)/g, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

const APELIDOS: Record<Campo, string[]> = {
  data: ["data", "dia", "date", "data do gasto", "data da compra", "quando"],
  descricao: [
    "descricao", "historico", "item", "nome", "lancamento", "o que foi",
    "estabelecimento", "detalhe", "detalhes", "description", "gasto",
  ],
  valor: ["valor", "quantia", "montante", "preco", "total", "value", "amount", "custo"],
  categoria: ["categoria", "category", "grupo", "classificacao"],
  cartao: ["cartao", "card", "cartao de credito"],
  tipo: ["tipo", "tipo lancamento", "tipo de lancamento", "natureza"],
};

/** Adivinha qual coluna é qual pelo nome. A pessoa confere e ajusta na tela. */
export function mapearCabecalho(cabecalho: string[]): Partial<Record<Campo, number>> {
  const mapa: Partial<Record<Campo, number>> = {};
  const usadas = new Set<number>();

  (Object.keys(APELIDOS) as Campo[]).forEach((campo) => {
    const idx = cabecalho.findIndex(
      (h, i) => !usadas.has(i) && APELIDOS[campo].includes(normalizar(h))
    );
    if (idx >= 0) {
      mapa[campo] = idx;
      usadas.add(idx);
    }
  });

  return mapa;
}

/**
 * A primeira linha é cabeçalho? Se alguma célula dela parece data ou
 * valor, é dado, não título.
 */
export function pareceCabecalho(primeira: string[]): boolean {
  return !primeira.some(
    (c) => c.trim() && (lerValor(c) !== null || lerData(c, "dmy") !== null)
  );
}

export type TipoLancamento = "gasto" | "renda" | "investimento";

/** Célula da coluna "tipo" → tipo de lançamento, ou null se não reconhecer. */
export function lerTipo(bruto: string): TipoLancamento | null {
  const s = normalizar(bruto);
  if (/^(gast|despes|saida|debito)/.test(s)) return "gasto";
  if (/^(rend|receita|entrada|salario|credito)/.test(s)) return "renda";
  if (/^(invest|aporte)/.test(s)) return "investimento";
  return null;
}

// ---------------------------------------------------------------------
// Escrever (exportar)
// ---------------------------------------------------------------------

/**
 * Texto que começa com = + - @ vira fórmula no Excel ao abrir o CSV
 * ("injeção de CSV"). Um apóstrofo na frente desliga isso. A importação
 * tira o apóstrofo de volta, pra exportar e reimportar dar o mesmo texto.
 */
const FORMULA = /^[=+\-@\t\r]/;

export function protegerTexto(s: string) {
  return FORMULA.test(s) ? `'${s}` : s;
}

export function desprotegerTexto(s: string) {
  return s.length > 1 && s[0] === "'" && FORMULA.test(s.slice(1)) ? s.slice(1) : s;
}

/**
 * Matriz → CSV no formato que o Excel em português abre certo sem
 * perguntar nada: separador ";", BOM de UTF-8 (senão acento vira lixo),
 * quebra de linha do Windows.
 */
export function gerarCsv(linhas: (string | number | null | undefined)[][]): string {
  const escapar = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + linhas.map((l) => l.map(escapar).join(";")).join("\r\n");
}

/** 1234.5 → "1234,50": vírgula decimal, sem milhar (milhar confunde a volta). */
export const valorCsv = (n: number) => Number(n).toFixed(2).replace(".", ",");

/** "2026-09-12" → "12/09/2026". */
export const dataCsv = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};
