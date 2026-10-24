"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { SegmentedField } from "@/components/form/Field";
import {
  Button,
  DeleteButton,
  EmptyState,
  ErrorNote,
  Loading,
  PageTitle,
  Tag,
  VOLTAR_AJUSTES,
  inputClass,
} from "@/components/ui";
import { decodificar, normalizar } from "@/lib/planilha";
import {
  ErroExtrato,
  ORIGEM_LABEL,
  chaveDoTitulo,
  cruzar,
  ehCartao,
  lerExtrato,
  type Lancado,
  type LinhaCruzada,
  type OrigemExtrato,
} from "@/lib/extrato";
import { addMonths, firstDayOfMonth, formatDate, money } from "@/lib/format";
import type { BankAccount, Card, Category, ExpenseOccurrence } from "@/lib/types";

type Apelido = { title_norm: string; description: string; category_id: string | null };

/** O que a pessoa decidiu sobre cada linha. */
type Escolha = { incluir: boolean; descricao: string; categoriaId: string };

type Lido = {
  nome: string;
  origem: OrigemExtrato;
  linhas: LinhaCruzada[];
};

/**
 * Importar extrato do banco (C30) — só no modo pessoal. Pra quem esquece de
 * lançar: manda a fatura ou o extrato e o app separa o que é novo do que
 * já está lançado, mesmo com nome diferente (o valor e a data mandam).
 */
export default function ExtratoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, empresa } = useScope();

  const [cartoes, setCartoes] = useState<Card[]>([]);
  const [contas, setContas] = useState<BankAccount[]>([]);
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [apelidos, setApelidos] = useState<Map<string, Apelido>>(new Map());
  // Sem isto, um arquivo escolhido antes de os cartões chegarem caía em "Conta" (C31).
  const [carregado, setCarregado] = useState(false);

  const [lendo, setLendo] = useState(false);
  const [lido, setLido] = useState<Lido | null>(null);
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({});
  const [destino, setDestino] = useState<"cartao" | "conta">("cartao");
  const [cartaoId, setCartaoId] = useState("");
  const [contaId, setContaId] = useState("");
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ id: string; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (empresa) return;
    (async () => {
      const [c, b, cat, ap] = await Promise.all([
        supabase.from("cards").select("*").eq("user_id", me.id).eq("archived", false).order("name"),
        supabase.from("bank_accounts").select("*").eq("user_id", me.id).eq("archived", false).order("name"),
        supabase.from("categories").select("*").eq("user_id", me.id).eq("archived", false).order("name"),
        supabase.from("statement_aliases").select("title_norm, description, category_id"),
      ]);
      setCartoes((c.data ?? []) as Card[]);
      setContas((b.data ?? []) as BankAccount[]);
      setCategorias((cat.data ?? []) as Category[]);
      setApelidos(new Map(((ap.data ?? []) as Apelido[]).map((a) => [a.title_norm, a])));
      setCarregado(true);
    })();
  }, [supabase, me.id, empresa]);

  if (empresa) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle voltar={VOLTAR_AJUSTES} title="Importar extrato" />
        <EmptyState
          title="Só no modo pessoal"
          description="Importar o extrato do banco é pros seus gastos pessoais. Na empresa, use Importar planilha."
        />
      </div>
    );
  }

  async function escolherArquivo(arquivo: File) {
    setError(null);
    setResultado(null);
    setLido(null);
    if (arquivo.size > 5 * 1024 * 1024) return setError("Arquivo grande demais (máximo 5 MB).");
    setLendo(true);
    try {
      const { origem, linhas } = lerExtrato(decodificar(await arquivo.arrayBuffer()));
      if (!linhas.length) throw new ErroExtrato("Não achei nenhum lançamento nesse arquivo.");
      const gastos = linhas.filter((l) => l.tipo === "gasto");
      const datas = gastos.map((l) => l.data).sort();

      // O que já veio de extrato antes (a mesma linha) — em lotes, pra URL não estourar.
      const refs = gastos.map((l) => l.ref);
      const importadas = new Set<string>();
      for (let i = 0; i < refs.length; i += 80) {
        const { data, error: e } = await supabase
          .from("expenses")
          .select("extrato_ref")
          .eq("user_id", me.id)
          .in("extrato_ref", refs.slice(i, i + 80));
        if (e) throw new ErroExtrato("Não deu para conferir o que já foi importado. A migração 024 pode não ter rodado ainda.");
        for (const r of data ?? []) importadas.add(r.extrato_ref as string);
      }

      // O que está lançado nos meses do extrato (um mês de folga pra cada lado).
      const lancados: Lancado[] = [];
      if (datas.length) {
        const de = addMonths(firstDayOfMonth(datas[0]), -1);
        const ate = addMonths(firstDayOfMonth(datas[datas.length - 1]), 1);
        const { data: occ } = await supabase.rpc("expense_occurrences", { p_from: de, p_to: ate });
        const minhas = ((occ ?? []) as ExpenseOccurrence[]).filter((o) => o.user_id === me.id);
        const ids = [...new Set(minhas.map((o) => o.expense_id))];
        const datasDosGastos = new Map<string, string>();
        for (let i = 0; i < ids.length; i += 80) {
          const { data } = await supabase.from("expenses").select("id, start_date").in("id", ids.slice(i, i + 80));
          for (const g of data ?? []) datasDosGastos.set(g.id as string, (g.start_date as string).slice(0, 10));
        }
        for (const o of minhas) {
          const avulso = o.kind === "variable";
          lancados.push({
            chave: `${o.expense_id}|${o.month}`,
            expenseId: o.expense_id,
            descricao: o.description,
            valor: Number(o.amount),
            data: avulso ? (datasDosGastos.get(o.expense_id) ?? o.month) : o.month.slice(0, 10),
            porMes: !avulso,
            parcela: o.installment_number,
            parcelasTotal: o.installments_total,
            categoriaId: o.category_id,
          });
        }

        // Compra parcelada lançada inteira, de uma vez: pode ter sido meses antes.
        const parceladas = gastos.filter((l) => l.parcela);
        if (parceladas.length) {
          const maisParcelas = Math.max(...parceladas.map((l) => l.parcela!.n));
          const { data: avulsos } = await supabase
            .from("expenses")
            .select("id, description, amount, start_date, category_id")
            .eq("user_id", me.id)
            .eq("kind", "variable")
            .gte("start_date", addMonths(firstDayOfMonth(datas[0]), -(maisParcelas + 1)))
            .lte("start_date", datas[datas.length - 1]);
          for (const g of avulsos ?? []) {
            lancados.push({
              chave: `inteira|${g.id}`,
              expenseId: g.id as string,
              descricao: g.description as string,
              valor: Number(g.amount),
              data: (g.start_date as string).slice(0, 10),
              porMes: false,
              parcela: null,
              inteira: true,
              categoriaId: (g.category_id as string | null) ?? null,
            });
          }
        }
      }

      const cruzadas = cruzar(linhas, lancados, importadas, apelidos);
      setEscolhas(
        Object.fromEntries(
          cruzadas.map((l) => {
            const apelido = apelidos.get(chaveDoTitulo(l.limpo));
            return [
              l.ref,
              {
                incluir: l.situacao === "novo",
                descricao: apelido?.description ?? l.limpo,
                categoriaId: apelido?.category_id ?? "",
              },
            ];
          })
        )
      );
      setLido({ nome: arquivo.name, origem, linhas: cruzadas });

      // De onde saiu: cartão pra fatura, conta pro extrato. Chuta o Nubank pelo nome.
      const cartao = ehCartao(origem);
      // Fatura é cartão, sempre: sem cartão cadastrado, a tela pede pra cadastrar
      // em vez de lançar calado como Pix.
      setDestino(cartao ? "cartao" : "conta");
      const nu = (n: string) => /\bnu\b|nubank|roxinho/i.test(normalizar(n));
      setCartaoId((cartoes.find((c) => nu(c.name)) ?? cartoes[0])?.id ?? "");
      setContaId((contas.find((c) => nu(c.name)) ?? contas[0])?.id ?? "");
    } catch (e) {
      setError(e instanceof ErroExtrato ? e.message : "Não deu para ler esse arquivo.");
    } finally {
      setLendo(false);
    }
  }

  const linhas = lido?.linhas ?? [];
  const novos = linhas.filter((l) => l.situacao === "novo");
  const parecidos = linhas.filter((l) => l.situacao === "parecido");
  const importados = linhas.filter((l) => l.situacao === "importado");
  const fora = linhas.filter((l) => l.situacao === "fora");
  const aLancar = linhas.filter((l) => escolhas[l.ref]?.incluir && (l.situacao === "novo" || l.situacao === "parecido"));
  const totalALancar = aLancar.reduce((s, l) => s + l.valor, 0);

  const mudar = (ref: string, patch: Partial<Escolha>) =>
    setEscolhas((e) => ({ ...e, [ref]: { ...e[ref], ...patch } }));

  async function importar() {
    if (!lido || !aLancar.length) return;
    if (destino === "cartao" && !cartaoId) return setError("Escolha o cartão.");
    setImportando(true);
    setError(null);

    const { data: imp, error: e1 } = await supabase
      .from("imports")
      .insert({ file_name: `Extrato: ${lido.nome}`.slice(0, 200), row_count: aLancar.length })
      .select("id")
      .single();
    if (e1 || !imp) {
      setImportando(false);
      return setError("Não deu para começar a importação.");
    }

    try {
      const registros = aLancar.map((l) => {
        const esc = escolhas[l.ref];
        const descricao = (esc.descricao.trim() || l.limpo).slice(0, 110);
        return {
          description: l.parcela ? `${descricao} (parcela ${l.parcela.n}/${l.parcela.total})` : descricao,
          amount: l.valor,
          kind: "variable",
          payment_method: destino === "cartao" ? "card" : "pix",
          card_id: destino === "cartao" ? cartaoId : null,
          bank_account_id: destino === "conta" ? contaId || null : null,
          category_id: esc.categoriaId || null,
          start_date: l.data,
          import_id: imp.id,
          extrato_ref: l.ref,
        };
      });
      for (let i = 0; i < registros.length; i += 100) {
        const { error: e } = await supabase.from("expenses").insert(registros.slice(i, i + 100));
        if (e) throw e;
      }

      // Aprende: o nome e a categoria que a pessoa deu pra cada nome do extrato.
      const aprendidos = new Map<string, Apelido>();
      for (const l of aLancar) {
        const esc = escolhas[l.ref];
        const descricao = esc.descricao.trim();
        if (!descricao || (descricao === l.limpo && !esc.categoriaId)) continue;
        const chave = chaveDoTitulo(l.limpo);
        if (chave) aprendidos.set(chave, { title_norm: chave, description: descricao.slice(0, 120), category_id: esc.categoriaId || null });
      }
      if (aprendidos.size) {
        await supabase.from("statement_aliases").upsert(
          [...aprendidos.values()].map((a) => ({ ...a, updated_at: new Date().toISOString() })),
          { onConflict: "user_id,title_norm" }
        );
        setApelidos((m) => new Map([...m, ...aprendidos]));
      }

      setResultado({ id: imp.id, total: aLancar.length });
      setLido(null);
    } catch (e) {
      // Nada pela metade: apagar a importação leva junto o que entrou.
      await supabase.from("imports").delete().eq("id", imp.id);
      const duplicado = (e as { code?: string })?.code === "23505";
      setError(
        duplicado
          ? "Parte desse extrato já tinha sido importada (talvez em outra aba). Mande o arquivo de novo pra conferir."
          : "Não deu para lançar os gastos. Nada foi salvo; tente de novo."
      );
    } finally {
      setImportando(false);
    }
  }

  async function desfazer(id: string) {
    const { error: e } = await supabase.from("imports").delete().eq("id", id);
    if (e) return setError("Não deu para desfazer.");
    setResultado(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        voltar={VOLTAR_AJUSTES}
        title="Importar extrato"
        description="Esqueceu de lançar? Mande a fatura do cartão ou o extrato da conta e o app lança o que falta, sem repetir o que já está aqui."
      />

      {resultado && (
        <div className="card flex flex-col gap-3 px-4 py-4">
          <p className="font-semibold">
            {resultado.total} {resultado.total === 1 ? "gasto lançado" : "gastos lançados"}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/gastos" className="text-sm font-semibold text-[var(--scope)]">
              Ver nos Gastos
            </Link>
            <DeleteButton onConfirm={() => desfazer(resultado.id)} label="Desfazer esta importação" />
          </div>
        </div>
      )}

      {!lido && (
        <section className="card flex flex-col gap-3 px-4 py-5">
          <label
            aria-disabled={!carregado || lendo}
            className={[
              "inline-flex min-h-11 w-fit cursor-pointer items-center justify-center rounded-lg bg-[var(--scope)] px-4 text-sm font-semibold text-[var(--color-ink)]",
              !carregado || lendo ? "pointer-events-none opacity-50" : "",
            ].join(" ")}
          >
            {!carregado ? "Carregando…" : lendo ? "Lendo…" : "Escolher arquivo (CSV ou OFX)"}
            <input
              type="file"
              accept=".csv,.ofx,.qfx,text/csv,application/x-ofx"
              className="sr-only"
              disabled={!carregado || lendo}
              onChange={(event) => {
                const f = event.target.files?.[0];
                if (f) escolherArquivo(f);
                event.target.value = "";
              }}
            />
          </label>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-[var(--color-text-dim)]">
            <li>
              <strong className="text-[var(--color-text)]">Nubank:</strong> a fatura do cartão em CSV, o extrato da
              conta em CSV ou o OFX. O app do Nubank manda por e-mail.
            </li>
            <li>
              <strong className="text-[var(--color-text)]">Outros bancos:</strong> o arquivo OFX (às vezes chamado
              &ldquo;Money&rdquo; ou &ldquo;Quicken&rdquo;) do extrato ou da fatura.
            </li>
            <li>
              O que entrou na conta, os estornos e o pagamento da fatura ficam de fora: só os gastos entram.
            </li>
          </ul>
        </section>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {lendo && <Loading label="Conferindo o que já está lançado…" />}

      {lido && (
        <>
          <section className="card flex flex-col gap-4 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{lido.nome}</p>
                <p className="text-xs text-[var(--color-text-faint)]">{ORIGEM_LABEL[lido.origem]}</p>
              </div>
              <Button variant="ghost" className="py-1.5" onClick={() => setLido(null)}>
                Trocar arquivo
              </Button>
            </div>

            <SegmentedField
              label="De onde saiu o dinheiro"
              value={destino}
              onChange={setDestino}
              options={[
                { value: "cartao", label: "Cartão" },
                { value: "conta", label: "Conta (Pix/débito)" },
              ]}
            />
            {destino === "cartao" ? (
              cartoes.length ? (
                <select
                  aria-label="Cartão"
                  className={inputClass}
                  value={cartaoId}
                  onChange={(event) => setCartaoId(event.target.value)}
                >
                  {cartoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-[var(--color-out)]">
                  Você não tem cartão cadastrado.{" "}
                  <Link href="/cartoes" className="underline">
                    Cadastre o cartão
                  </Link>{" "}
                  ou escolha Conta.
                </p>
              )
            ) : (
              <select
                aria-label="Conta"
                className={inputClass}
                value={contaId}
                onChange={(event) => setContaId(event.target.value)}
              >
                <option value="">Sem conta definida</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--color-text-faint)]">
              <span>
                <strong className="text-[var(--color-text)]">{novos.length}</strong> novos
              </span>
              <span>
                <strong className="text-[var(--color-text)]">{parecidos.length}</strong> parecem já lançados
              </span>
              {importados.length > 0 && <span>{importados.length} já importados antes</span>}
              {fora.length > 0 && <span>{fora.length} fora (entradas, estornos, fatura)</span>}
            </p>
          </section>

          {parecidos.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Parecem já lançados</h2>
              <p className="-mt-1 text-xs text-[var(--color-text-faint)]">
                Mesmo valor e data perto de algo que você já lançou, mesmo com outro nome. Ficam de fora; marque
                se for outra compra.
              </p>
              <ul className="flex flex-col gap-2">
                {parecidos.map((l) => (
                  <Linha
                    key={l.ref}
                    l={l}
                    esc={escolhas[l.ref]}
                    categorias={categorias}
                    onChange={(p) => mudar(l.ref, p)}
                  />
                ))}
              </ul>
            </section>
          )}

          {novos.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Novos</h2>
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    const todos = novos.every((l) => escolhas[l.ref]?.incluir);
                    setEscolhas((e) => {
                      const n = { ...e };
                      for (const l of novos) n[l.ref] = { ...n[l.ref], incluir: !todos };
                      return n;
                    });
                  }}
                >
                  {novos.every((l) => escolhas[l.ref]?.incluir) ? "Desmarcar todos" : "Marcar todos"}
                </Button>
              </div>
              <p className="-mt-1 text-xs text-[var(--color-text-faint)]">
                Ajuste o nome e a categoria se quiser: o app lembra pra próxima vez.
              </p>
              <ul className="flex flex-col gap-2">
                {novos.map((l) => (
                  <Linha
                    key={l.ref}
                    l={l}
                    esc={escolhas[l.ref]}
                    categorias={categorias}
                    onChange={(p) => mudar(l.ref, p)}
                  />
                ))}
              </ul>
            </section>
          )}

          {!novos.length && !parecidos.length && (
            <EmptyState
              title="Nada novo nesse extrato"
              description="Tudo o que tem nele já foi importado antes, ou não é gasto."
            />
          )}

          {(novos.length > 0 || parecidos.length > 0) && (
            <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur md:bottom-4">
              <span className="text-sm">
                {aLancar.length} {aLancar.length === 1 ? "gasto" : "gastos"} ·{" "}
                <strong className="money">{money(totalALancar)}</strong>
              </span>
              <Button
                onClick={importar}
                disabled={importando || !aLancar.length || (destino === "cartao" && !cartaoId)}
              >
                {importando ? "Lançando…" : `Lançar ${aLancar.length}`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Linha({
  l,
  esc,
  categorias,
  onChange,
}: {
  l: LinhaCruzada;
  esc: Escolha | undefined;
  categorias: Category[];
  onChange: (p: Partial<Escolha>) => void;
}) {
  if (!esc) return null;
  return (
    <li
      className={[
        "card flex flex-col gap-2.5 px-4 py-3 transition-opacity",
        esc.incluir ? "" : "opacity-60",
      ].join(" ")}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={esc.incluir}
          onChange={(event) => onChange({ incluir: event.target.checked })}
          className="mt-1 h-4 w-4 shrink-0"
          aria-label={`Lançar ${l.titulo}`}
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
            <span>{formatDate(l.data)}</span>
            <span className="truncate">{l.titulo}</span>
            {l.parcela && (
              <Tag>
                parcela {l.parcela.n}/{l.parcela.total}
              </Tag>
            )}
          </p>
          {l.parecidoCom && (
            <p className="mt-1 text-sm text-[var(--color-text-dim)]">
              {l.parecidoCom.inteira ? "Lançado inteiro: " : "Já lançado: "}
              <strong className="text-[var(--color-text)]">{l.parecidoCom.descricao}</strong>
              {l.parecidoCom.parcela ? ` (parcela ${l.parecidoCom.parcela})` : ""}
              {Math.abs(l.parecidoCom.valor - l.valor) > 0.009 ? ` · ${money(l.parecidoCom.valor)}` : ""} ·{" "}
              {l.parecidoCom.porMes ? "no mesmo mês" : formatDate(l.parecidoCom.data)}
            </p>
          )}
        </div>
        <span className="money shrink-0 font-semibold">{money(l.valor)}</span>
      </label>
      {esc.incluir && (
        <div className="grid grid-cols-1 gap-2 pl-7 sm:grid-cols-2">
          <input
            className={`${inputClass} py-2 text-sm`}
            value={esc.descricao}
            onChange={(event) => onChange({ descricao: event.target.value })}
            aria-label="Nome do gasto"
          />
          <select
            className={`${inputClass} py-2 text-sm`}
            value={esc.categoriaId}
            onChange={(event) => onChange({ categoriaId: event.target.value })}
            aria-label="Categoria"
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}
