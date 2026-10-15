/**
 * Medidor de velocidade (FASE_F.md, F8.1 e F8.8). Desligado por padrão;
 * liga em Configurações → Velocidade.
 *
 * Uma tela está "pronta" quando o último "Carregando…" some e nenhum outro
 * aparece logo em seguida. Toda tela mostra o <Loading /> enquanto busca
 * dados (e o loading.tsx do painel cobre a ida ao servidor), então medir o
 * Loading mede a tela inteira, sem mexer em cada uma.
 *
 * - Abrir o app: do começo do carregamento da página até ficar pronta.
 * - Trocar de tela: do toque no link (ou no voltar) até a nova ficar pronta.
 *
 * Fica só neste aparelho (localStorage); nada vai pro servidor.
 */

export type Medida = {
  tela: string;
  ms: number;
  /** true = abriu o app; false = trocou de tela. */
  abertura: boolean;
  quando: number;
};

const CHAVE_LIGADO = "rumo:medir";
const CHAVE_MEDIDAS = "rumo:medidas";
const MAXIMO = 30;
/** Quanto esperar depois que o último "Carregando…" some. */
const FOLGA_MS = 150;

let tela: string | null = typeof window === "undefined" ? null : window.location.pathname;
let inicio = 0; // performance.now() é 0 no começo do carregamento da página
let abertura = true;
let ativos = 0;
let espera: ReturnType<typeof setTimeout> | undefined;
const ouvintes = new Set<() => void>();

export function medidorLigado() {
  try {
    return window.localStorage.getItem(CHAVE_LIGADO) === "1";
  } catch {
    return false;
  }
}

export function ligarMedidor(ligar: boolean) {
  try {
    if (ligar) window.localStorage.setItem(CHAVE_LIGADO, "1");
    else window.localStorage.removeItem(CHAVE_LIGADO);
  } catch {}
  avisar();
}

export function medidas(): Medida[] {
  try {
    return JSON.parse(window.localStorage.getItem(CHAVE_MEDIDAS) ?? "[]") as Medida[];
  } catch {
    return [];
  }
}

export function limparMedidas() {
  try {
    window.localStorage.removeItem(CHAVE_MEDIDAS);
  } catch {}
  avisar();
}

export function aoMudar(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Nenhum "Carregando…" na tela: o que a pessoa pediu já chegou. */
export function nadaCarregando() {
  return ativos === 0;
}

/** Começa a medir uma troca de tela. */
export function comecarTroca(destino: string) {
  tela = destino;
  inicio = performance.now();
  abertura = false;
}

/**
 * A tela nova entrou. Se ela veio pronta (guardada, sem "Carregando…"),
 * a troca termina aqui; se mostra "Carregando…", termina quando ele sumir.
 */
export function telaTrocou() {
  if (ativos > 0 || tela === null) return;
  const fim = performance.now();
  clearTimeout(espera);
  espera = setTimeout(() => {
    if (ativos === 0) registrar(fim);
  }, FOLGA_MS);
}

export function carregandoApareceu() {
  ativos++;
  clearTimeout(espera);
}

export function carregandoSumiu() {
  ativos = Math.max(0, ativos - 1);
  if (ativos > 0) return;
  const fim = performance.now();
  clearTimeout(espera);
  espera = setTimeout(() => {
    if (ativos === 0) registrar(fim);
  }, FOLGA_MS);
}

function registrar(fim: number) {
  if (tela === null) return;
  const medida: Medida = {
    tela,
    ms: Math.round(fim - inicio),
    abertura,
    quando: Date.now(),
  };
  // Mudar de mês ou de filtro também mostra "Carregando…": isso não é
  // troca de tela, então só a primeira vez depois do toque conta.
  tela = null;
  if (!medidorLigado()) return;
  try {
    const lista = [medida, ...medidas()].slice(0, MAXIMO);
    window.localStorage.setItem(CHAVE_MEDIDAS, JSON.stringify(lista));
  } catch {}
  avisar();
}

function avisar() {
  ouvintes.forEach((ouvinte) => ouvinte());
}
