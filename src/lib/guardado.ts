/**
 * O que cada tela já carregou, guardado na memória da aba (FASE_F.md, F8.6).
 *
 * Voltar a uma tela mostra na hora o que ela tinha da última vez, e a busca
 * no banco corre por trás pra atualizar ("mostra o guardado, confere o
 * novo"). Só memória: recarregar a página ou fechar o app zera tudo, e nada
 * vai pro localStorage — dado financeiro não fica gravado no aparelho.
 *
 * A chave leva a pessoa e a casa (useChaveGuardada), então trocar de conta
 * ou de casa nunca mostra o guardado de outra. Sair limpa tudo.
 */
const guardados = new Map<string, unknown>();

/** A chave de uma tela: pessoa, casa e o que mais distinguir (mês, ano). */
export function chaveGuardada(
  meId: string,
  casaId: string | null | undefined,
  ...partes: (string | number)[]
) {
  return [meId, casaId ?? "-", ...partes].join(":");
}

export function lerGuardado<T>(chave: string): T | undefined {
  return guardados.get(chave) as T | undefined;
}

export function guardar<T>(chave: string, valor: T) {
  guardados.set(chave, valor);
}

export function esquecerGuardados() {
  guardados.clear();
}
