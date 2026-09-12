"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { SegmentedField } from "@/components/form/Field";
import {
  Button,
  DeleteButton,
  ErrorNote,
  PageTitle,
  inputClass,
} from "@/components/ui";
import { formatDate, money } from "@/lib/format";
import { PALETTE } from "@/lib/palette";
import {
  decodificar,
  desprotegerTexto,
  detectarOrdem,
  detectarSeparador,
  lerCsv,
  lerData,
  lerTipo,
  lerValor,
  mapearCabecalho,
  normalizar,
  pareceCabecalho,
  type Campo,
  type TipoLancamento,
} from "@/lib/planilha";
import type { Card, Category } from "@/lib/types";

/** Uma importação é uma requisição só por tabela; acima disso, dividir o arquivo. */
const MAX_LINHAS = 2000;
const MAX_BYTES = 5 * 1024 * 1024;
/** A prévia mostra as primeiras; a contagem considera todas. */
const PREVIA = 100;

type Modo = "gasto" | "renda" | "sinal";
type Etapa = "arquivo" | "revisar" | "importando" | "feito";

type Linha = {
  n: number;
  data: string | null;
  descricao: string;
  valor: number | null;
  tipo: TipoLancamento | null;
  categoriaNome: string | null;
  categoriaId: string | null;
  categoriaNova: boolean;
  cartaoId: string | null;
  problemas: string[];
  avisos: string[];
  duplicado: boolean;
};

type Importacao = { id: string; file_name: string; row_count: number; created_at: string };

const CAMPOS: { campo: Campo; rotulo: string; obrigatorio?: boolean }[] = [
  { campo: "data", rotulo: "Data", obrigatorio: true },
  { campo: "descricao", rotulo: "Descrição", obrigatorio: true },
  { campo: "valor", rotulo: "Valor", obrigatorio: true },
  { campo: "categoria", rotulo: "Categoria" },
  { campo: "cartao", rotulo: "Cartão" },
  { campo: "tipo", rotulo: "Tipo (gasto, renda…)" },
];

const TIPO_ROTULO: Record<TipoLancamento, string> = {
  gasto: "Gasto",
  renda: "Renda",
  investimento: "Investimento",
};

/**
 * Importar planilha. A regra é a mesma do áudio: nada entra sem a pessoa
 * ver. A prévia mostra cada linha como vai ficar, e o que não dá pra ler
 * vira erro visível em vez de valor inventado.
 *
 * O arquivo é lido NO APARELHO e nunca é enviado: só as linhas confirmadas
 * viram lançamentos. A política de privacidade diz isso.
 *
 * Toda importação ganha uma linha em `imports`, e cada lançamento aponta
 * pra ela. Desfazer = apagar essa linha; o banco leva o resto por cascade.
 */
export default function ImportarPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me } = useScope();

  const [etapa, setEtapa] = useState<Etapa>("arquivo");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [bruto, setBruto] = useState<string[][]>([]);
  const [temCabecalho, setTemCabecalho] = useState(true);
  const [mapa, setMapa] = useState<Partial<Record<Campo, number>>>({});
  const [modo, setModo] = useState<Modo>("gasto");
  const [criarCategorias, setCriarCategorias] = useState(true);
  const [incluirDuplicados, setIncluirDuplicados] = useState(false);

  const [categorias, setCategorias] = useState<Category[]>([]);
  const [cartoes, setCartoes] = useState<Card[]>([]);
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [historico, setHistorico] = useState<Importacao[]>([]);

  const [resultado, setResultado] = useState<{
    id: string;
    gastos: number;
    rendas: number;
    investimentos: number;
    categorias: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carregarBase = useCallback(async () => {
    const [cat, car, imp] = await Promise.all([
      supabase.from("categories").select("*").eq("user_id", me.id),
      supabase.from("cards").select("*").eq("user_id", me.id).eq("archived", false),
      supabase.from("imports").select("*").order("created_at", { ascending: false }).limit(20),
    ]);
    setCategorias((cat.data ?? []) as Category[]);
    setCartoes((car.data ?? []) as Card[]);
    setHistorico((imp.data ?? []) as Importacao[]);
  }, [supabase, me.id]);

  useEffect(() => {
    carregarBase();
  }, [carregarBase]);

  // -------------------------------------------------------------------
  // 1. Arquivo
  // -------------------------------------------------------------------
  async function escolher(arquivo: File) {
    setError(null);
    const nome = arquivo.name.toLowerCase();

    if (/\.(xlsx?|ods|numbers)$/.test(nome)) {
      setError(
        "Esse arquivo é de planilha, não CSV. No Excel: Arquivo → Salvar como → CSV (separado por ponto e vírgula). No Google Planilhas: Arquivo → Fazer download → CSV."
      );
      return;
    }
    if (arquivo.size > MAX_BYTES) {
      setError("Arquivo grande demais (máximo 5 MB). Divida em partes menores.");
      return;
    }

    const texto = decodificar(await arquivo.arrayBuffer());
    const linhas = lerCsv(texto, detectarSeparador(texto));

    if (linhas.length === 0) {
      setError("Não achamos nenhuma linha nesse arquivo.");
      return;
    }

    const cabecalho = pareceCabecalho(linhas[0]);
    const dados = cabecalho ? linhas.length - 1 : linhas.length;
    if (dados > MAX_LINHAS) {
      setError(
        `Esse arquivo tem ${dados} linhas. Importe no máximo ${MAX_LINHAS} por vez — divida a planilha em partes.`
      );
      return;
    }

    setNomeArquivo(arquivo.name);
    setBruto(linhas);
    setTemCabecalho(cabecalho);
    setMapa(cabecalho ? mapearCabecalho(linhas[0]) : {});
    setModo("gasto");
    setIncluirDuplicados(false);
    setEtapa("revisar");
  }

  // -------------------------------------------------------------------
  // 2. Revisar
  // -------------------------------------------------------------------
  const cabecalho = temCabecalho ? bruto[0] ?? [] : [];
  const dados = useMemo(() => (temCabecalho ? bruto.slice(1) : bruto), [bruto, temCabecalho]);
  const colunas = Math.max(0, ...bruto.map((l) => l.length));

  const celula = (linha: string[], campo: Campo) =>
    mapa[campo] === undefined ? "" : (linha[mapa[campo]!] ?? "").trim();

  const ordem = useMemo(
    () => detectarOrdem(mapa.data === undefined ? [] : dados.map((l) => celula(l, "data"))),
    [dados, mapa.data]
  );

  const categoriaPorNome = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categorias) m.set(normalizar(c.name), c);
    return m;
  }, [categorias]);

  const cartaoPorNome = useMemo(() => {
    const m = new Map<string, Card>();
    for (const c of cartoes) m.set(normalizar(c.name), c);
    return m;
  }, [cartoes]);

  const linhas: Linha[] = useMemo(() => {
    const deslocamento = temCabecalho ? 2 : 1;

    return dados.map((l, i) => {
      const problemas: string[] = [];
      const avisos: string[] = [];

      const data = lerData(celula(l, "data"), ordem.ordem);
      if (!data) problemas.push("data inválida");

      const descricao = desprotegerTexto(celula(l, "descricao")).slice(0, 200);
      if (!descricao) problemas.push("sem descrição");

      // O banco guarda centavos (numeric 12,2) e recusa zero: arredonda antes
      // de validar, senão 0,001 passaria aqui e derrubaria a importação inteira.
      const celulaValor = lerValor(celula(l, "valor"));
      const lido = celulaValor === null ? null : Math.round(celulaValor * 100) / 100;
      if (lido === null) problemas.push("valor inválido");
      else if (lido === 0) problemas.push("valor zero");
      else if (Math.abs(lido) >= 1e10) problemas.push("valor grande demais");

      let tipo: TipoLancamento | null = null;
      const tipoCelula = celula(l, "tipo");
      if (mapa.tipo !== undefined && tipoCelula) {
        tipo = lerTipo(tipoCelula);
        if (!tipo) problemas.push(`tipo "${tipoCelula}" não reconhecido`);
      } else if (modo === "sinal") {
        tipo = lido !== null && lido < 0 ? "gasto" : "renda";
      } else {
        tipo = modo;
      }

      let categoriaNome: string | null = null;
      let categoriaId: string | null = null;
      let categoriaNova = false;
      let cartaoId: string | null = null;

      // Categoria e cartão só existem pra gasto.
      if (tipo === "gasto") {
        const cat = desprotegerTexto(celula(l, "categoria"));
        if (cat) {
          const existente = categoriaPorNome.get(normalizar(cat));
          if (existente) {
            categoriaNome = existente.name;
            categoriaId = existente.id;
          } else if (criarCategorias) {
            categoriaNome = cat;
            categoriaNova = true;
          } else {
            avisos.push(`categoria "${cat}" não existe — entra sem categoria`);
          }
        }

        const car = desprotegerTexto(celula(l, "cartao"));
        if (car) {
          const cartao = cartaoPorNome.get(normalizar(car));
          if (cartao) cartaoId = cartao.id;
          else avisos.push(`cartão "${car}" não encontrado — entra como Pix`);
        }
      }

      const valor = lido === null ? null : Math.abs(lido);
      const duplicado =
        problemas.length === 0 &&
        existentes.has(chave(tipo!, data!, valor!, descricao));

      return {
        n: i + deslocamento,
        data,
        descricao,
        valor,
        tipo,
        categoriaNome,
        categoriaId,
        categoriaNova,
        cartaoId,
        problemas,
        avisos,
        duplicado,
      };
    });
  }, [dados, mapa, modo, criarCategorias, ordem.ordem, categoriaPorNome, cartaoPorNome, existentes, temCabecalho]);

  // Busca o que já existe na mesma faixa de datas, pra marcar duplicados.
  // Reimportar a mesma planilha é o erro mais provável de todos.
  const validas = linhas.filter((l) => l.problemas.length === 0);
  const faixa = validas.length
    ? validas.reduce(
        (f, l) => ({ de: l.data! < f.de ? l.data! : f.de, ate: l.data! > f.ate ? l.data! : f.ate }),
        { de: validas[0].data!, ate: validas[0].data! }
      )
    : null;
  const chaveFaixa = faixa ? `${faixa.de}|${faixa.ate}` : "";

  useEffect(() => {
    if (!chaveFaixa) return;
    const [de, ate] = chaveFaixa.split("|");
    (async () => {
      const [g, r, iv] = await Promise.all([
        supabase.from("expenses").select("description, amount, start_date").eq("user_id", me.id).gte("start_date", de).lte("start_date", ate),
        supabase.from("incomes").select("source, amount, start_date").eq("user_id", me.id).gte("start_date", de).lte("start_date", ate),
        supabase.from("investments").select("name, amount, start_date").eq("user_id", me.id).gte("start_date", de).lte("start_date", ate),
      ]);
      const s = new Set<string>();
      for (const x of g.data ?? []) s.add(chave("gasto", x.start_date, Number(x.amount), x.description));
      for (const x of r.data ?? []) s.add(chave("renda", x.start_date, Number(x.amount), x.source));
      for (const x of iv.data ?? []) s.add(chave("investimento", x.start_date, Number(x.amount), x.name));
      setExistentes(s);
    })();
  }, [supabase, me.id, chaveFaixa]);

  const obrigatoriosOk = mapa.data !== undefined && mapa.descricao !== undefined && mapa.valor !== undefined;
  const erros = linhas.filter((l) => l.problemas.length > 0);
  const duplicados = linhas.filter((l) => l.problemas.length === 0 && l.duplicado);
  const aImportar = linhas.filter(
    (l) => l.problemas.length === 0 && (!l.duplicado || incluirDuplicados)
  );
  const novasCategorias = new Set(
    aImportar.filter((l) => l.categoriaNova).map((l) => normalizar(l.categoriaNome!))
  ).size;

  const podeImportar = obrigatoriosOk && !ordem.conflito && aImportar.length > 0;

  // -------------------------------------------------------------------
  // 3. Importar
  // -------------------------------------------------------------------
  async function importar() {
    if (!podeImportar) return;
    setEtapa("importando");
    setError(null);

    const { data: registro, error: e1 } = await supabase
      .from("imports")
      .insert({ file_name: nomeArquivo.slice(0, 200), row_count: aImportar.length })
      .select("id")
      .single();

    if (e1 || !registro) {
      setError("Não deu para começar a importação. Tente de novo.");
      setEtapa("revisar");
      return;
    }
    const importId = registro.id as string;

    try {
      // Categorias novas primeiro, pra ter o id delas nos gastos.
      const idPorNome = new Map<string, string>();
      const nomesNovos = new Map<string, string>();
      for (const l of aImportar)
        if (l.categoriaNova) nomesNovos.set(normalizar(l.categoriaNome!), l.categoriaNome!);

      if (nomesNovos.size) {
        const usadas = new Set(categorias.map((c) => c.color));
        const livres = PALETTE.filter((c) => !usadas.has(c));
        const cores = livres.length ? livres : [...PALETTE];
        const { data: criadas, error: e2 } = await supabase
          .from("categories")
          .insert([...nomesNovos.values()].map((name, i) => ({ name, color: cores[i % cores.length] })))
          .select("id, name");
        if (e2) throw e2;
        for (const c of criadas ?? []) idPorNome.set(normalizar(c.name), c.id);
      }

      const gastos = aImportar.filter((l) => l.tipo === "gasto");
      const rendas = aImportar.filter((l) => l.tipo === "renda");
      const aportes = aImportar.filter((l) => l.tipo === "investimento");

      if (gastos.length) {
        const { error: e } = await supabase.from("expenses").insert(
          gastos.map((l) => ({
            description: l.descricao,
            amount: l.valor,
            payment_method: l.cartaoId ? "card" : "pix",
            kind: "variable",
            card_id: l.cartaoId,
            category_id: l.categoriaId ?? (l.categoriaNova ? idPorNome.get(normalizar(l.categoriaNome!)) ?? null : null),
            start_date: l.data,
            import_id: importId,
          }))
        );
        if (e) throw e;
      }
      if (rendas.length) {
        const { error: e } = await supabase.from("incomes").insert(
          rendas.map((l) => ({
            source: l.descricao, amount: l.valor, kind: "one_time", start_date: l.data, import_id: importId,
          }))
        );
        if (e) throw e;
      }
      if (aportes.length) {
        const { error: e } = await supabase.from("investments").insert(
          aportes.map((l) => ({
            name: l.descricao, amount: l.valor, kind: "one_time", asset_type: "Outros",
            start_date: l.data, import_id: importId,
          }))
        );
        if (e) throw e;
      }

      setResultado({
        id: importId,
        gastos: gastos.length,
        rendas: rendas.length,
        investimentos: aportes.length,
        categorias: nomesNovos.size,
      });
      setEtapa("feito");
      carregarBase();
    } catch {
      // Apagar a importação leva junto, por cascade, o que já tinha entrado.
      // Categorias criadas ficam: não fazem mal e podem ser apagadas à mão.
      await supabase.from("imports").delete().eq("id", importId);
      setError("A importação falhou no meio e foi desfeita — nenhum lançamento ficou pela metade. Tente de novo.");
      setEtapa("revisar");
    }
  }

  async function desfazer(id: string) {
    setError(null);
    const { error: e } = await supabase.from("imports").delete().eq("id", id);
    if (e) return setError("Não deu para desfazer. Tente de novo.");
    if (resultado?.id === id) {
      setResultado(null);
      setEtapa("arquivo");
    }
    carregarBase();
  }

  function recomecar() {
    setEtapa("arquivo");
    setBruto([]);
    setNomeArquivo("");
    setResultado(null);
    setError(null);
  }

  // -------------------------------------------------------------------
  // Tela
  // -------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title="Importar planilha"
        description="Traga os lançamentos de uma planilha. Você confere tudo antes de entrar, e dá pra desfazer depois."
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {etapa === "arquivo" && (
        <>
          <section className="card flex flex-col gap-4 px-4 py-5">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-line)] px-4 py-8 text-center transition-colors hover:border-[var(--scope)]">
              <span className="font-semibold">Escolher arquivo CSV</span>
              <span className="text-xs text-[var(--color-text-faint)]">
                Até {MAX_LINHAS} linhas. O arquivo é lido aqui no seu aparelho e não é enviado.
              </span>
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const f = event.target.files?.[0];
                  if (f) escolher(f);
                  event.target.value = "";
                }}
              />
            </label>

            <div className="text-xs leading-relaxed text-[var(--color-text-faint)]">
              <p className="font-medium text-[var(--color-text-dim)]">Como gerar o CSV</p>
              <p>
                <strong>Excel:</strong> Arquivo → Salvar como → &ldquo;CSV (separado por
                ponto e vírgula)&rdquo;. <strong>Google Planilhas:</strong> Arquivo →
                Fazer download → CSV.
              </p>
              <p className="mt-1">
                Precisa ter pelo menos uma coluna de <strong>data</strong>, uma de{" "}
                <strong>descrição</strong> e uma de <strong>valor</strong>. Categoria,
                cartão e tipo são opcionais.
              </p>
            </div>
          </section>

          {historico.length > 0 && (
            <section className="card flex flex-col gap-3 px-4 py-5">
              <div>
                <h2 className="text-sm font-semibold">Importações anteriores</h2>
                <p className="mt-0.5 text-xs text-[var(--color-text-faint)]">
                  Desfazer apaga tudo o que veio do arquivo — inclusive o que você editou depois.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {historico.map((imp) => (
                  <li key={imp.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{imp.file_name}</span>
                      <span className="text-xs text-[var(--color-text-faint)]">
                        {formatDate(imp.created_at)} · {imp.row_count}{" "}
                        {imp.row_count === 1 ? "lançamento" : "lançamentos"}
                      </span>
                    </span>
                    <DeleteButton onConfirm={() => desfazer(imp.id)} label="Desfazer" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {(etapa === "revisar" || etapa === "importando") && (
        <>
          <section className="card flex flex-col gap-4 px-4 py-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Qual coluna é qual</h2>
              <span className="truncate text-xs text-[var(--color-text-faint)]">{nomeArquivo}</span>
            </div>

            <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-text-dim)]">
              <input
                type="checkbox"
                checked={temCabecalho}
                onChange={(event) => {
                  setTemCabecalho(event.target.checked);
                  setMapa(event.target.checked ? mapearCabecalho(bruto[0] ?? []) : {});
                }}
                className="h-5 w-5 accent-[var(--scope)]"
              />
              A primeira linha tem os nomes das colunas
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              {CAMPOS.map(({ campo, rotulo, obrigatorio }) => (
                <label key={campo} className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-sm font-medium text-[var(--color-text-dim)]">
                    {rotulo}
                    {obrigatorio && <span className="text-[var(--color-out)]"> *</span>}
                  </span>
                  <select
                    className={inputClass}
                    value={mapa[campo] ?? ""}
                    onChange={(event) => {
                      const v = event.target.value;
                      setMapa((m) => {
                        const novo = { ...m };
                        if (v === "") delete novo[campo];
                        else novo[campo] = Number(v);
                        return novo;
                      });
                    }}
                  >
                    <option value="">{obrigatorio ? "Escolha a coluna" : "Não usar"}</option>
                    {Array.from({ length: colunas }, (_, i) => (
                      <option key={i} value={i}>
                        {cabecalho[i]?.trim() || `Coluna ${i + 1}`}
                        {dados[0]?.[i] ? ` — ex: ${dados[0][i].slice(0, 24)}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {mapa.tipo === undefined ? (
              <SegmentedField<Modo>
                label="O que são estas linhas"
                value={modo}
                onChange={setModo}
                options={[
                  { value: "gasto", label: "Gastos" },
                  { value: "renda", label: "Renda" },
                  { value: "sinal", label: "Pelo sinal" },
                ]}
              />
            ) : (
              <p className="text-xs text-[var(--color-text-faint)]">
                A coluna de tipo decide, linha por linha, se é gasto, renda ou investimento.
              </p>
            )}
            {mapa.tipo === undefined && modo === "sinal" && (
              <p className="-mt-2 text-xs text-[var(--color-text-faint)]">
                Valor negativo vira gasto; positivo vira renda — como num extrato de banco.
              </p>
            )}

            {mapa.categoria !== undefined && (
              <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-text-dim)]">
                <input
                  type="checkbox"
                  checked={criarCategorias}
                  onChange={(event) => setCriarCategorias(event.target.checked)}
                  className="h-5 w-5 accent-[var(--scope)]"
                />
                Criar as categorias que ainda não existem
              </label>
            )}
          </section>

          {obrigatoriosOk && ordem.conflito && (
            <ErrorNote>
              A coluna de data mistura dia/mês e mês/dia (tem linhas como 25/03 e outras como
              03/25). Corrija a planilha para um formato só e escolha o arquivo de novo.
            </ErrorNote>
          )}
          {obrigatoriosOk && !ordem.conflito && ordem.ambiguo && (
            <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-text-dim)]">
              Nenhuma data desta planilha tem dia maior que 12, então não dá pra ter certeza se é
              dia/mês ou mês/dia. <strong>Assumimos dia/mês</strong> — confira as datas na prévia
              abaixo antes de importar.
            </p>
          )}
          {obrigatoriosOk && !ordem.conflito && !ordem.ambiguo && ordem.ordem === "mdy" && (
            <p className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-text-dim)]">
              As datas estão no formato <strong>mês/dia</strong> (padrão americano). Já estamos lendo assim.
            </p>
          )}

          {!obrigatoriosOk ? (
            <p className="text-sm text-[var(--color-text-dim)]">
              Escolha as colunas de data, descrição e valor para ver a prévia.
            </p>
          ) : (
            <section className="card flex flex-col gap-4 px-4 py-5">
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span><strong className="money">{aImportar.length}</strong> vão entrar</span>
                {duplicados.length > 0 && (
                  <span className="text-[var(--color-text-dim)]">
                    <strong className="money">{duplicados.length}</strong> parecem já existir
                  </span>
                )}
                {erros.length > 0 && (
                  <span className="text-[var(--color-out)]">
                    <strong className="money">{erros.length}</strong> com erro (ficam de fora)
                  </span>
                )}
                {novasCategorias > 0 && (
                  <span className="text-[var(--color-text-dim)]">
                    <strong className="money">{novasCategorias}</strong>{" "}
                    {novasCategorias === 1 ? "categoria nova" : "categorias novas"}
                  </span>
                )}
              </div>

              {duplicados.length > 0 && (
                <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-text-dim)]">
                  <input
                    type="checkbox"
                    checked={incluirDuplicados}
                    onChange={(event) => setIncluirDuplicados(event.target.checked)}
                    className="h-5 w-5 accent-[var(--scope)]"
                  />
                  Importar também as que parecem já existir (mesma data, valor e descrição)
                </label>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-text-faint)]">
                      <th className="pb-2 pr-2 font-medium">Linha</th>
                      <th className="pb-2 pr-2 font-medium">Data</th>
                      <th className="pb-2 pr-2 font-medium">Descrição</th>
                      <th className="pb-2 pr-2 font-medium">Tipo</th>
                      <th className="pb-2 pr-2 text-right font-medium">Valor</th>
                      <th className="pb-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, PREVIA).map((l) => {
                      const fora = l.problemas.length > 0 || (l.duplicado && !incluirDuplicados);
                      return (
                        <tr
                          key={l.n}
                          className={[
                            "border-t border-[var(--color-line)] align-top",
                            fora ? "opacity-50" : "",
                          ].join(" ")}
                        >
                          <td className="money py-2 pr-2 text-[var(--color-text-faint)]">{l.n}</td>
                          <td className="money py-2 pr-2">{l.data ? formatDate(l.data) : "—"}</td>
                          <td className="py-2 pr-2">
                            <span className="block max-w-[16rem] truncate">{l.descricao || "—"}</span>
                            {l.categoriaNome && (
                              <span className="text-xs text-[var(--color-text-faint)]">
                                {l.categoriaNome}
                                {l.categoriaNova && " (nova)"}
                                {l.cartaoId && " · cartão"}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-[var(--color-text-dim)]">
                            {l.tipo ? TIPO_ROTULO[l.tipo] : "—"}
                          </td>
                          <td className="money py-2 pr-2 text-right">
                            {l.valor !== null ? money(l.valor) : "—"}
                          </td>
                          <td className="py-2 text-xs">
                            {l.problemas.length > 0 ? (
                              <span className="text-[var(--color-out)]">{l.problemas.join(", ")}</span>
                            ) : l.duplicado ? (
                              <span className="text-[var(--color-text-faint)]">parece já existir</span>
                            ) : l.avisos.length > 0 ? (
                              <span className="text-[var(--color-text-dim)]">{l.avisos.join("; ")}</span>
                            ) : (
                              <span className="text-[var(--color-in)]">ok</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {linhas.length > PREVIA && (
                <p className="text-xs text-[var(--color-text-faint)]">
                  Mostrando as primeiras {PREVIA} de {linhas.length} linhas. As contagens acima consideram todas.
                </p>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={importar} disabled={!podeImportar || etapa === "importando"}>
              {etapa === "importando"
                ? "Importando…"
                : `Importar ${aImportar.length} ${aImportar.length === 1 ? "lançamento" : "lançamentos"}`}
            </Button>
            <Button variant="ghost" onClick={recomecar} disabled={etapa === "importando"}>
              Escolher outro arquivo
            </Button>
          </div>
        </>
      )}

      {etapa === "feito" && resultado && (
        <section className="card flex flex-col gap-4 px-4 py-5">
          <div>
            <h2 className="font-semibold">Importação concluída</h2>
            <ul className="mt-2 flex flex-col gap-0.5 text-sm text-[var(--color-text-dim)]">
              {resultado.gastos > 0 && <li><strong className="money">{resultado.gastos}</strong> gastos</li>}
              {resultado.rendas > 0 && <li><strong className="money">{resultado.rendas}</strong> rendas</li>}
              {resultado.investimentos > 0 && <li><strong className="money">{resultado.investimentos}</strong> investimentos</li>}
              {resultado.categorias > 0 && <li><strong className="money">{resultado.categorias}</strong> categorias criadas</li>}
            </ul>
          </div>
          <p className="text-xs text-[var(--color-text-faint)]">
            Algo saiu errado? Desfazer apaga tudo o que veio deste arquivo. As categorias criadas
            ficam — dá pra apagar em Categorias, se não quiser.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/gastos"><Button>Ver gastos</Button></Link>
            <Button variant="ghost" onClick={recomecar}>Importar outro</Button>
            <DeleteButton onConfirm={() => desfazer(resultado.id)} label="Desfazer esta importação" />
          </div>
        </section>
      )}
    </div>
  );
}

/** Mesma data, valor e descrição, do mesmo tipo = provavelmente o mesmo lançamento. */
function chave(tipo: TipoLancamento, data: string, valor: number, descricao: string) {
  return `${tipo}|${data.slice(0, 10)}|${Number(valor).toFixed(2)}|${normalizar(descricao)}`;
}
