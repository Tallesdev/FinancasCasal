"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useChaveGuardada, useScope } from "@/components/ScopeProvider";
import { guardar, lerGuardado } from "@/lib/guardado";
import { buscarRecebidos, buscarRenda, type RendaGuardada } from "@/lib/telas";
import { SegmentedField } from "@/components/form/Field";
import { AnexarRecibos, Clipe } from "@/components/AnexarRecibos";
import { listarAprovados } from "@/lib/orcamentos-app";
import {
  Button,
  DeleteButton,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  OwnerTag,
  PageTitle,
  Sheet,
  Tag,
  inputClass,
} from "@/components/ui";
import {
  addMonths,
  firstDayOfMonth,
  formatDate,
  money,
  monthLabel,
  toISODate,
} from "@/lib/format";
import {
  aReceber,
  conjuntoRecebido,
  mesesDe,
  parcelasRecebidas,
  type Pendencia,
} from "@/lib/recebimentos";
import {
  ENTRY_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type EntryKind,
  type Income,
  type IncomeReceived,
  type OrcAprovado,
  type PaymentMethod,
  type Receipt,
  type ReciboLido,
} from "@/lib/types";

/** Como o cliente paga. Só na empresa; na família o tipo continua o de sempre. */
type Modo = "avista" | "parcelado" | "mensal";

const MODO_LABEL: Record<Modo, string> = {
  avista: "À vista",
  parcelado: "Parcelado",
  mensal: "Todo mês",
};

type Draft = {
  id: string | null;
  source: string;
  amount: string;
  kind: EntryKind;
  start_date: string;
  end_date: string;
  notes: string;
  // Empresa (FASE_F.md, F2)
  modo: Modo;
  parcelas: string;
  client: string;
  /** Só em recebimento novo: já marca o 1º mês como recebido. */
  jaRecebido: boolean;
  /** Onde caiu: "" = conta da empresa; id = conta pessoal do sócio (migração 016). */
  caiuEm: string;
  /** Como o cliente pagou (migração 020). "" = não informado. */
  forma: "" | PaymentMethod;
  /** Orçamento aprovado que está sendo lançado (C27, migração 023). */
  quoteId: string | null;
  quoteNumero: string | null;
};

const EMPTY: Draft = {
  id: null,
  source: "",
  amount: "",
  kind: "recurring",
  start_date: toISODate(new Date()),
  end_date: "",
  notes: "",
  modo: "avista",
  parcelas: "",
  client: "",
  jaRecebido: true,
  caiuEm: "",
  forma: "",
  quoteId: null,
  quoteNumero: null,
};

const arredondar = (v: number) => Math.round(v * 100) / 100;

function modoDe(income: Income): Modo {
  if (income.installments_total) return "parcelado";
  return income.kind === "one_time" ? "avista" : "mensal";
}

export default function RendaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { me, members, userIds, scope, empresa, recursos } = useScope();
  // Empresa não tem "renda": recebe de cliente (FASE_F.md, F1.5).
  const novo = empresa ? "Novo recebimento" : "Nova renda";

  // O que esta tela tinha da última vez (lib/guardado.ts): aparece na hora,
  // e o load() confere o novo por trás.
  const chave = useChaveGuardada("renda");
  const [inicial] = useState(() => lerGuardado<RendaGuardada>(chave));
  const [incomes, setIncomes] = useState<Income[]>(inicial?.incomes ?? []);
  const [recebidos, setRecebidos] = useState<IncomeReceived[]>(inicial?.recebidos ?? []);
  /** Falso enquanto a migração 014 não roda: some tudo que depende de "recebido". */
  const [recebidosOk, setRecebidosOk] = useState(inicial?.recebidosOk ?? false);
  const [loading, setLoading] = useState(!inicial);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // A leitura do recibo termina depois de um await: lê o formulário de agora.
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;
  /** Comprovantes por recebimento (C26) — pro clipe na lista e pra abrir na edição. */
  const [recibosPorRecebimento, setRecibosPorRecebimento] = useState<Record<string, Receipt[]>>(
    inicial?.recibosPorRecebimento ?? {}
  );
  /** Os do formulário aberto. Em recebimento novo, sobem soltos e são ligados ao salvar. */
  const [recibosDoForm, setRecibosDoForm] = useState<Receipt[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [marcando, setMarcando] = useState<string | null>(null);
  const [desfazer, setDesfazer] = useState<{ income_id: string; month: string; rotulo: string } | null>(null);
  // Seções recolhíveis da empresa. Lembra no navegador; é só conforto de quem olha.
  const [abertoAReceber, setAbertoAReceber] = useLembrado("rumofacil:a-receber-aberto", true);
  const [abertoTodos, setAbertoTodos] = useLembrado("rumofacil:recebimentos-aberto", true);
  const [abertoAprovados, setAbertoAprovados] = useLembrado("rumofacil:aprovados-aberto", true);
  /** Orçamentos aprovados no app de orçamentos que ainda não viraram recebimento (C27). */
  const [aprovados, setAprovados] = useState<OrcAprovado[]>([]);
  const [erroAprovados, setErroAprovados] = useState<string | null>(null);

  const carregarRecebidos = useCallback(async () => {
    const marcados = await buscarRecebidos(supabase, empresa);
    if (!empresa) return;
    setRecebidosOk(marcados.recebidosOk);
    setRecebidos(marcados.recebidos);
    const guardada = lerGuardado<RendaGuardada>(chave);
    if (guardada) guardar(chave, { ...guardada, ...marcados });
  }, [supabase, empresa, chave]);

  const load = useCallback(async () => {
    const guardada = lerGuardado<RendaGuardada>(chave);
    if (guardada) {
      setIncomes(guardada.incomes);
      setRecebidos(guardada.recebidos);
      setRecebidosOk(guardada.recebidosOk);
      setRecibosPorRecebimento(guardada.recibosPorRecebimento ?? {});
      setLoading(false);
    } else setLoading(true);

    const novos = await buscarRenda(supabase, empresa, recursos.recibos);
    if (!novos)
      setError(empresa ? "Não deu para carregar os recebimentos." : "Não deu para carregar a renda.");
    else {
      setError(null);
      guardar(chave, novos);
      setIncomes(novos.incomes);
      setRecebidos(novos.recebidos);
      setRecebidosOk(novos.recebidosOk);
      setRecibosPorRecebimento(novos.recibosPorRecebimento ?? {});
    }
    setLoading(false);
  }, [supabase, empresa, chave, recursos.recibos]);

  useEffect(() => {
    load();
  }, [load]);

  const carregarAprovados = useCallback(() => {
    if (!empresa || !recursos.orcamentos) return;
    listarAprovados()
      .then((lista) => {
        setAprovados(lista);
        setErroAprovados(null);
      })
      .catch((e: Error) => setErroAprovados(e.message));
  }, [empresa, recursos.orcamentos]);

  useEffect(() => {
    carregarAprovados();
  }, [carregarAprovados]);

  /** Abre o formulário já preenchido com o orçamento. Quem decide como entra é a pessoa. */
  function lancarOrcamento(o: OrcAprovado) {
    const itens = o.itens.length
      ? ` · ${o.itens[0]}${o.itens.length > 1 ? ` +${o.itens.length - 1}` : ""}`
      : "";
    setDraft({
      ...EMPTY,
      source: `Orçamento ${o.numero}${itens}`.slice(0, 120),
      client: o.cliente,
      amount: String(o.total),
      notes: o.pagamento ? `Pagamento: ${o.pagamento}`.slice(0, 500) : "",
      // Aprovado não quer dizer pago.
      jaRecebido: false,
      quoteId: o.id,
      quoteNumero: o.numero,
    });
    setRecibosDoForm([]);
    setFormError(null);
  }

  async function ignorarOrcamento(o: OrcAprovado) {
    const { error: e } = await supabase.from("quote_dismissals").insert({ quote_id: o.id });
    if (e) return setErroAprovados("Não deu para tirar da lista. Tente de novo.");
    setAprovados((lista) => lista.filter((x) => x.id !== o.id));
  }

  const profileById = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    for (const m of members)
      map[m.id] = { name: m.display_name, color: m.color };
    return map;
  }, [members]);

  // Nenhuma leitura ignora o escopo.
  const visible = useMemo(
    () => incomes.filter((income) => userIds.includes(income.user_id)),
    [incomes, userIds]
  );
  const hoje = useMemo(() => toISODate(new Date()), []);

  /** Quanto entra por mês hoje: só o que é recorrente e ainda está valendo. */
  const monthly = visible
    .filter((income) => income.kind === "recurring")
    .filter((income) => income.start_date <= hoje && (!income.end_date || income.end_date >= hoje))
    .reduce((sum, income) => sum + Number(income.amount), 0);

  const pendencias = useMemo(
    () => (empresa && recebidosOk ? aReceber(visible, recebidos, hoje) : []),
    [empresa, recebidosOk, visible, recebidos, hoje]
  );
  const totalAReceber = pendencias.reduce((s, p) => s + p.valor, 0);
  const totalAtrasado = pendencias.filter((p) => p.atrasado).reduce((s, p) => s + p.valor, 0);
  const recebido = useMemo(() => conjuntoRecebido(recebidos), [recebidos]);

  /** Clientes já usados, pra sugerir e não virar "Joao" e "João" no relatório. */
  const clientes = useMemo(
    () =>
      Array.from(
        new Set(incomes.map((i) => i.client?.trim()).filter((c): c is string => Boolean(c)))
      ).sort((a, b) => a.localeCompare(b)),
    [incomes]
  );

  /** Repete a última renda avulsa, só pedindo o valor da vez. */
  const ultimaAvulsa = useMemo(
    () =>
      incomes
        .filter((income) => income.user_id === me.id && income.kind === "one_time")
        .sort((a, b) => b.start_date.localeCompare(a.start_date))[0] ?? null,
    [incomes, me.id]
  );

  function lancarDaSemana() {
    if (!ultimaAvulsa) return;
    setDraft({
      ...EMPTY,
      source: ultimaAvulsa.source,
      client: ultimaAvulsa.client ?? "",
      caiuEm: ultimaAvulsa.received_into ?? "",
      kind: "one_time",
      modo: "avista",
      start_date: toISODate(new Date()),
    });
    setFormError(null);
  }

  function abrirEdicao(income: Income) {
    const modo = modoDe(income);
    setDraft({
      id: income.id,
      source: income.source,
      // Parcelado guarda o valor da parcela; o formulário mostra o total.
      amount:
        modo === "parcelado" && income.installments_total
          ? String(arredondar(Number(income.amount) * income.installments_total))
          : String(income.amount),
      kind: income.kind,
      start_date: income.start_date.slice(0, 10),
      end_date: modo === "parcelado" ? "" : (income.end_date?.slice(0, 10) ?? ""),
      notes: income.notes ?? "",
      modo,
      parcelas: income.installments_total?.toString() ?? "",
      client: income.client ?? "",
      caiuEm: income.received_into ?? "",
      forma: income.payment_method ?? "",
      // Na edição o vínculo com o orçamento não muda.
      quoteId: null,
      quoteNumero: null,
      jaRecebido:
        modo === "avista" && recebido.has(`${income.id}|${firstDayOfMonth(income.start_date)}`),
    });
    setRecibosDoForm(recibosPorRecebimento[income.id] ?? []);
    setFormError(null);
  }

  function fecharForm() {
    setDraft(null);
    setRecibosDoForm([]);
  }

  /**
   * A IA leu o comprovante (C26). Igual ao gasto: sugere, não salva, e só
   * preenche campo VAZIO — o que diverge do que a pessoa digitou vira aviso.
   */
  function aplicarLeitura(l: ReciboLido): string {
    const atual = draftRef.current;
    if (!atual) return "";

    const patch: Partial<Draft> = {};
    const preenchidos: string[] = [];
    const diferentes: string[] = [];

    if (l.description && !atual.source.trim()) {
      patch.source = l.description;
      preenchidos.push("o que foi");
    }

    if (l.amount != null) {
      const digitado = Number(atual.amount.replace(",", "."));
      if (!atual.amount) {
        // Parcelado pede o total; o comprovante é de um pagamento só.
        patch.amount = String(l.amount);
        preenchidos.push("valor");
      } else if (atual.modo !== "parcelado" && Math.abs(digitado - l.amount) > 0.005) {
        diferentes.push(`valor ${money(l.amount)}`);
      }
    }

    if (l.date && l.date !== atual.start_date) {
      // Em recebimento novo a data é só o padrão (hoje): o comprovante sabe mais.
      if (!atual.id) {
        patch.start_date = l.date;
        preenchidos.push("data");
      } else {
        diferentes.push(`data ${formatDate(l.date)}`);
      }
    }

    if (l.client) {
      if (!atual.client.trim()) {
        // Se o cliente já existe com outra grafia ("joão" x "João"), usa o de sempre.
        patch.client =
          clientes.find((c) => c.toLowerCase() === l.client!.toLowerCase()) ?? l.client;
        preenchidos.push("cliente");
      } else if (atual.client.trim().toLowerCase() !== l.client.toLowerCase()) {
        diferentes.push(`cliente ${l.client}`);
      }
    }

    if (l.payment_method && !atual.forma) {
      patch.forma = l.payment_method;
      preenchidos.push("forma de pagamento");
    }

    if (Object.keys(patch).length) {
      setDraft((d) => (d ? { ...d, ...patch } : d));
    }

    const partes: string[] = [];
    if (preenchidos.length) partes.push(`Preenchido pelo recibo: ${preenchidos.join(", ")}.`);
    if (diferentes.length)
      partes.push(`O recibo diz ${diferentes.join(" e ")} — diferente do que está no formulário.`);
    if (!partes.length) return "A leitura não trouxe nada novo. Confira os campos à mão.";
    return `${partes.join(" ")} Confira antes de salvar.`;
  }

  async function save() {
    if (!draft) return;

    const source = draft.source.trim();
    const amount = Number(draft.amount.replace(",", "."));
    const parcelas = Number(draft.parcelas);
    const parcelado = empresa && draft.modo === "parcelado";
    const kind: EntryKind = empresa ? (draft.modo === "avista" ? "one_time" : "recurring") : draft.kind;

    if (!source)
      return setFormError(
        empresa ? "Diga o que foi esse recebimento." : "Diga de onde vem essa renda."
      );
    if (!Number.isFinite(amount) || amount <= 0)
      return setFormError("Informe um valor maior que zero.");
    if (!draft.start_date) return setFormError("Escolha a data.");
    if (parcelado && (!Number.isInteger(parcelas) || parcelas < 2 || parcelas > 120))
      return setFormError("Parcelado precisa de 2 a 120 parcelas.");
    if (kind === "recurring" && !parcelado && draft.end_date && draft.end_date < draft.start_date)
      return setFormError("O fim não pode ser antes do começo.");

    const payload: Record<string, unknown> = {
      source,
      // No parcelado a pessoa digita o total; guardamos o valor de cada parcela.
      amount: parcelado ? arredondar(amount / parcelas) : amount,
      kind,
      start_date: draft.start_date,
      // Parcelado = "todo mês" que termina na última parcela (migração 014).
      end_date: parcelado
        ? addMonths(firstDayOfMonth(draft.start_date), parcelas - 1)
        : kind === "recurring" && draft.end_date
          ? draft.end_date
          : null,
      notes: draft.notes.trim() || null,
    };
    // Colunas da 014 só vão na empresa: a conta pessoal não depende dela.
    if (empresa) {
      payload.installments_total = parcelado ? parcelas : null;
      payload.client = draft.client.trim() || null;
      // Coluna da 016: só manda quando precisa, pra seguir salvando antes da migração.
      if (draft.caiuEm || draft.id) payload.received_into = draft.caiuEm || null;
      // Coluna da 020, mesma ideia.
      if (draft.forma || draft.id) payload.payment_method = draft.forma || null;
      // Colunas da 023: só no recebimento que veio de um orçamento.
      if (draft.quoteId) {
        payload.quote_id = draft.quoteId;
        payload.quote_number = draft.quoteNumero;
      }
    }

    setSaving(true);
    setFormError(null);

    const { data: salvo, error: writeError } = draft.id
      ? await supabase.from("incomes").update(payload).eq("id", draft.id).select("id").single()
      : await supabase.from("incomes").insert(payload).select("id").single();

    if (writeError || !salvo) {
      setSaving(false);
      setFormError(
        writeError?.code === "23505" && draft.quoteId
          ? "Este orçamento já foi lançado (talvez pelo outro sócio). Atualize a tela."
          : "Não deu para salvar. Confira os campos."
      );
      return;
    }
    if (draft.quoteId) setAprovados((lista) => lista.filter((x) => x.id !== draft.quoteId));

    const mesInicial = firstDayOfMonth(draft.start_date);
    const caiuEm = draft.start_date <= hoje ? draft.start_date : hoje;

    if (empresa && recebidosOk && !draft.id && draft.modo !== "mensal" && draft.jaRecebido) {
      // Recebimento novo que já caiu: marca o 1º mês (ou a 1ª parcela).
      await supabase
        .from("income_received")
        .insert({ income_id: salvo.id, month: mesInicial, received_on: caiuEm });
    } else if (empresa && recebidosOk && draft.id && draft.modo === "avista") {
      // À vista editado: o "Já caiu na conta?" manda. À vista tem um mês só,
      // então limpa o que houver (até de uma data antiga) e marca de novo.
      const antes = recebidos.find((r) => r.income_id === draft.id);
      const jaEstava = antes && firstDayOfMonth(antes.month) === mesInicial;
      if (!draft.jaRecebido || !jaEstava) {
        await supabase.from("income_received").delete().eq("income_id", draft.id);
        if (draft.jaRecebido)
          await supabase.from("income_received").insert({
            income_id: draft.id,
            month: mesInicial,
            received_on: antes?.received_on ?? caiuEm,
          });
      }
    }

    // Liga os comprovantes ao recebimento e acerta a data deles pela do
    // recebimento — é por essa data que a tela de recibos agrupa.
    if (recibosDoForm.length) {
      const { error: ligarError } = await supabase
        .from("receipts")
        .update({ income_id: salvo.id, occurred_on: draft.start_date })
        .in("id", recibosDoForm.map((r) => r.id));
      if (ligarError) {
        // O recebimento já está salvo: reabrir o formulário faria salvar duas vezes.
        setError("O recebimento foi salvo, mas o recibo não foi ligado a ele. Ligue pela tela Recibos.");
      }
    }

    setSaving(false);
    fecharForm();
    load();
  }

  async function remove(id: string) {
    await supabase.from("incomes").delete().eq("id", id);
    load();
  }

  async function marcar(income: Income, mes: string, rotulo: string) {
    const k = `${income.id}|${mes}`;
    setMarcando(k);
    const { error: e } = await supabase
      .from("income_received")
      .insert({ income_id: income.id, month: mes, received_on: hoje });
    setMarcando(null);
    if (e) return setError("Não deu para marcar como recebido. Tente de novo.");
    setError(null);
    setDesfazer({ income_id: income.id, month: mes, rotulo });
    carregarRecebidos();
  }

  async function desmarcar(incomeId: string, mes: string) {
    const { error: e } = await supabase
      .from("income_received")
      .delete()
      .eq("income_id", incomeId)
      .eq("month", mes);
    if (e) return setError("Não deu para desmarcar. Tente de novo.");
    setError(null);
    setDesfazer(null);
    carregarRecebidos();
  }

  /** Bolinhas das parcelas: toca pra marcar; tocar numa recebida pergunta antes de desmarcar. */
  function bolinhasDasParcelas(income: Income) {
    const meses = mesesDe(income, addMonths(firstDayOfMonth(income.start_date), 120));
    return (
      <span className="mt-2 flex flex-wrap gap-1">
        {meses.map((mes, i) => {
          const ok = recebido.has(`${income.id}|${mes}`);
          const rotulo = `parcela ${i + 1} de ${meses.length} (${monthLabel(mes, true)})`;
          return (
            <button
              key={mes}
              type="button"
              disabled={marcando === `${income.id}|${mes}`}
              title={`${rotulo}: ${ok ? "recebida" : "a receber"}`}
              aria-label={`${rotulo}: ${ok ? "recebida, tocar para desmarcar" : "a receber, tocar para marcar"}`}
              onClick={() =>
                ok
                  ? window.confirm(`Desmarcar a ${rotulo} como recebida?`) && desmarcar(income.id, mes)
                  : marcar(income, mes, `${income.source} — ${rotulo}`)
              }
              className={[
                "flex h-7 min-w-7 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold transition-colors",
                ok
                  ? "border-transparent bg-[var(--color-in)] text-[var(--color-ink)]"
                  : mes < firstDayOfMonth(hoje)
                    ? "border-[var(--color-out)] text-[var(--color-out)]"
                    : "border-[var(--color-line)] text-[var(--color-text-faint)]",
              ].join(" ")}
            >
              {ok ? "✓" : i + 1}
            </button>
          );
        })}
      </span>
    );
  }

  function rotuloPendencia(p: Pendencia) {
    if (p.parcela && p.income.installments_total)
      return `parcela ${p.parcela} de ${p.income.installments_total}`;
    return p.income.kind === "recurring" ? `mensalidade de ${monthLabel(p.mes, true)}` : formatDate(p.income.start_date);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={empresa ? "Recebimentos" : "Renda"}
        description={
          empresa
            ? "O que os clientes pagam para a empresa."
            : scope === "us"
              ? "O que entra para a casa."
              : "O que entra na sua conta."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {ultimaAvulsa && (
              <Button variant="ghost" onClick={lancarDaSemana}>
                Repetir &ldquo;{ultimaAvulsa.source}&rdquo;
              </Button>
            )}
            <Button onClick={() => setDraft({ ...EMPTY })}>{novo}</Button>
          </div>
        }
      />

      {empresa && recebidosOk ? (
        <div className="card flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-4">
          <div>
            <span className="text-sm text-[var(--color-text-dim)]">A receber</span>
            {totalAtrasado > 0 && (
              <p className="text-xs text-[var(--color-out)]">
                <span className="money">{money(totalAtrasado)}</span> atrasado
              </p>
            )}
          </div>
          <strong className="money text-xl text-[var(--color-in)]">{money(totalAReceber)}</strong>
        </div>
      ) : (
        <div className="card flex items-baseline justify-between gap-3 px-4 py-4">
          <span className="text-sm text-[var(--color-text-dim)]">Entra todo mês</span>
          <strong className="money text-xl text-[var(--color-in)]">{money(monthly)}</strong>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      {desfazer && (
        <div className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
          <span className="min-w-0 truncate text-[var(--color-text-dim)]">
            Recebido: {desfazer.rotulo}
          </span>
          <Button
            variant="quiet"
            className="shrink-0 px-2 py-0.5 text-xs"
            onClick={() => desmarcar(desfazer.income_id, desfazer.month)}
          >
            Desfazer
          </Button>
        </div>
      )}

      {/* Orçamentos aprovados que ainda não viraram recebimento (C27). */}
      {erroAprovados && <ErrorNote>{erroAprovados}</ErrorNote>}
      {aprovados.length > 0 && (
        <section className="flex flex-col gap-2">
          <TituloRecolhivel
            titulo="Orçamentos aprovados"
            detalhe={`${aprovados.length} pra lançar`}
            aberto={abertoAprovados}
            onToggle={() => setAbertoAprovados(!abertoAprovados)}
          />
          {abertoAprovados && (
            <ul className="flex flex-col gap-2">
              {aprovados.map((o) => (
                <li key={o.id} className="card flex flex-col gap-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{o.cliente || "Cliente sem nome"}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                        <Tag>orç. {o.numero}</Tag>
                        {o.status === "executado" && <Tag>executado</Tag>}
                        <span>{formatDate(o.data)}</span>
                        {o.itens.length > 0 && (
                          <span className="truncate">
                            {o.itens.slice(0, 2).join(", ")}
                            {o.itens.length > 2 ? ` +${o.itens.length - 2}` : ""}
                          </span>
                        )}
                      </p>
                      {o.pagamento && (
                        <p className="mt-1 text-xs text-[var(--color-text-dim)]">Pagamento: {o.pagamento}</p>
                      )}
                    </div>
                    <span className="money shrink-0 font-semibold text-[var(--color-in)]">{money(o.total)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="py-1.5" onClick={() => lancarOrcamento(o)}>
                      Lançar recebimento
                    </Button>
                    <Button
                      variant="quiet"
                      className="px-2 py-1.5 text-xs"
                      title="Tira da lista sem lançar. Ex.: já foi lançado à mão."
                      onClick={() => ignorarOrcamento(o)}
                    >
                      Já lancei / ignorar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* A receber (FASE_F.md, F2.4): atrasados primeiro, depois o mês e os próximos. */}
      {!loading && pendencias.length > 0 && (
        <section className="flex flex-col gap-2">
          <TituloRecolhivel
            titulo="A receber"
            detalhe={`${pendencias.length} ${pendencias.length === 1 ? "item" : "itens"}`}
            aberto={abertoAReceber}
            onToggle={() => setAbertoAReceber(!abertoAReceber)}
          />
          {abertoAReceber && (
          <ul className="flex flex-col gap-2">
            {pendencias.map((p) => {
              const k = `${p.income.id}|${p.mes}`;
              return (
                <li key={k} className="card flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {p.income.client ? `${p.income.client} · ` : ""}
                      {p.income.source}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                      <span>
                        {rotuloPendencia(p)} · {monthLabel(p.mes, true)}
                      </span>
                      {p.atrasado && (
                        <span className="font-semibold text-[var(--color-out)]">· atrasado</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="money font-semibold text-[var(--color-in)]">{money(p.valor)}</span>
                    <Button
                      variant="ghost"
                      className="px-2.5 py-1 text-xs"
                      disabled={marcando === k}
                      onClick={() => marcar(p.income, p.mes, `${p.income.source} — ${rotuloPendencia(p)}`)}
                    >
                      Recebi
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          )}
        </section>
      )}

      {loading ? (
        <Loading />
      ) : visible.length === 0 ? (
        <EmptyState
          title={empresa ? "Nenhum recebimento ainda" : "Nenhuma renda cadastrada"}
          description={
            empresa
              ? "Cadastre o que os clientes pagam para o lucro do mês fechar."
              : "Cadastre o salário e o que mais entra para o saldo fechar."
          }
          action={
            <Button onClick={() => setDraft({ ...EMPTY })}>{novo}</Button>
          }
        />
      ) : (
        <section className="flex flex-col gap-2">
          {empresa && (
            <TituloRecolhivel
              titulo="Todos os recebimentos"
              detalhe={String(visible.length)}
              aberto={abertoTodos}
              onToggle={() => setAbertoTodos(!abertoTodos)}
            />
          )}
          {(!empresa || abertoTodos) && (
          <ul className="flex flex-col gap-2">
            {visible.map((income) => {
              const mine = income.user_id === me.id;
              const owner = profileById[income.user_id];
              const modo = modoDe(income);
              const ended = income.end_date && income.end_date < hoje;
              const avistaRecebido =
                modo === "avista" && recebido.has(`${income.id}|${firstDayOfMonth(income.start_date)}`);

              return (
                <li
                  key={income.id}
                  className={[
                    "card flex items-start justify-between gap-3 px-4 py-3",
                    ended && !empresa ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{income.source}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
                      <Tag>
                        {empresa
                          ? modo === "parcelado"
                            ? `${income.installments_total}x`
                            : MODO_LABEL[modo]
                          : ENTRY_KIND_LABEL[income.kind]}
                      </Tag>
                      {empresa && income.client && <span>{income.client}</span>}
                      {empresa && income.quote_number && <Tag>orç. {income.quote_number}</Tag>}
                      {empresa && recibosPorRecebimento[income.id]?.length ? (
                        <span
                          className="inline-flex items-center text-[var(--color-text-dim)]"
                          title="Tem recibo"
                        >
                          <Clipe className="h-3.5 w-3.5" />
                          <span className="sr-only">Tem recibo</span>
                        </span>
                      ) : null}
                      {empresa && income.payment_method && (
                        <Tag>{PAYMENT_METHOD_LABEL[income.payment_method] ?? income.payment_method}</Tag>
                      )}
                      {empresa && income.received_into && (
                        <Tag>caiu na conta de {(profileById[income.received_into]?.name ?? "sócio").split(" ")[0]}</Tag>
                      )}
                      <span>
                        {income.kind === "one_time"
                          ? formatDate(income.start_date)
                          : `desde ${formatDate(income.start_date)}`}
                      </span>
                      {income.end_date && modo !== "parcelado" && (
                        <span>até {formatDate(income.end_date)}</span>
                      )}
                      {modo === "parcelado" && recebidosOk && (
                        <span>
                          · {parcelasRecebidas(income, recebidos)} de {income.installments_total} recebidas
                        </span>
                      )}
                      {empresa && modo === "avista" && recebidosOk && (
                        <button
                          type="button"
                          title={avistaRecebido ? "Tocar para voltar a \u201ca receber\u201d" : "Tocar para marcar como recebido"}
                          onClick={() => {
                            const mes = firstDayOfMonth(income.start_date);
                            if (!avistaRecebido) marcar(income, mes, income.source);
                            else if (window.confirm(`Voltar \u201c${income.source}\u201d para a receber?`))
                              desmarcar(income.id, mes);
                          }}
                          className={[
                            "rounded-full border px-2 py-0.5 font-medium transition-colors",
                            avistaRecebido
                              ? "border-transparent bg-[var(--color-in)]/15 text-[var(--color-in)]"
                              : "border-[var(--color-line)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
                          ].join(" ")}
                        >
                          {avistaRecebido ? "✓ recebido" : "a receber"}
                        </button>
                      )}
                      {scope === "us" && owner && (
                        <OwnerTag name={owner.name} color={owner.color} />
                      )}
                    </p>
                    {income.notes && (
                      <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                        {income.notes}
                      </p>
                    )}
                    {empresa && modo === "parcelado" && recebidosOk && bolinhasDasParcelas(income)}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="money font-semibold text-[var(--color-in)]">
                      {money(income.amount)}
                    </span>
                    {modo === "parcelado" && income.installments_total && (
                      <span className="money text-[11px] text-[var(--color-text-faint)]">
                        total {money(arredondar(Number(income.amount) * income.installments_total))}
                      </span>
                    )}
                    {mine && (
                      <span className="flex items-center gap-1">
                        <Button
                          variant="quiet"
                          className="px-2 py-0.5 text-xs"
                          onClick={() => abrirEdicao(income)}
                        >
                          Editar
                        </Button>
                        <DeleteButton onConfirm={() => remove(income.id)} />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          )}
        </section>
      )}

      {draft && (
        <Sheet
          title={
            draft.id
              ? empresa
                ? "Editar recebimento"
                : "Editar renda"
              : draft.quoteNumero
                ? `Lançar orçamento ${draft.quoteNumero}`
                : novo
          }
          onClose={fecharForm}
        >
          {empresa ? (
            <FormEmpresa
              draft={draft}
              setDraft={setDraft}
              clientes={clientes}
              podeMarcar={recebidosOk}
              socios={members.length > 1 ? members : []}
              anexos={
                <AnexarRecibos
                  recibos={recibosDoForm}
                  onChange={setRecibosDoForm}
                  data={draft.start_date}
                  expenseId={null}
                  incomeId={draft.id}
                  leitura="recebimento"
                  onLeitura={aplicarLeitura}
                />
              }
            />
          ) : (
            <FormFamilia draft={draft} setDraft={setDraft} />
          )}

          {formError && <div className="mt-4"><ErrorNote>{formError}</ErrorNote></div>}

          <div className="mt-6 flex gap-2">
            <Button onClick={save} disabled={saving} className="flex-1">
              {saving ? "Salvando…" : empresa ? "Salvar recebimento" : "Salvar renda"}
            </Button>
            <Button variant="ghost" onClick={fecharForm}>
              Cancelar
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** O formulário de sempre da conta pessoal. Não mudou. */
function FormFamilia({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="De onde vem">
        <input
          className={inputClass}
          value={draft.source}
          autoFocus
          placeholder="Salário, freela, aluguel…"
          onChange={(event) => setDraft({ ...draft, source: event.target.value })}
        />
      </Field>

      <Field label="Valor">
        <input
          className={`${inputClass} money`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={draft.amount}
          onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
        />
      </Field>

      <SegmentedField
        label="Tipo"
        value={draft.kind}
        onChange={(kind) =>
          setDraft({
            ...draft,
            kind,
            end_date: kind === "recurring" ? draft.end_date : "",
          })
        }
        options={(["recurring", "one_time"] as EntryKind[]).map((kind) => ({
          value: kind,
          label: ENTRY_KIND_LABEL[kind],
        }))}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={draft.kind === "one_time" ? "Data" : "Começa em"}>
          <input
            className={inputClass}
            type="date"
            value={draft.start_date}
            onChange={(event) => setDraft({ ...draft, start_date: event.target.value })}
          />
        </Field>

        {draft.kind === "recurring" && (
          <Field label="Termina em" hint="Deixe vazio se não tem fim.">
            <input
              className={inputClass}
              type="date"
              value={draft.end_date}
              onChange={(event) => setDraft({ ...draft, end_date: event.target.value })}
            />
          </Field>
        )}
      </div>

      <Field label="Observação" hint="Opcional">
        <input
          className={inputClass}
          value={draft.notes}
          onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
        />
      </Field>
    </div>
  );
}

/** Empresa: à vista, parcelado ou todo mês; cliente; se já caiu na conta. */
function FormEmpresa({
  draft,
  setDraft,
  clientes,
  podeMarcar,
  socios,
  anexos,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  clientes: string[];
  podeMarcar: boolean;
  socios: { id: string; display_name: string }[];
  /** Comprovante (C26). Fica fora do formulário pra ele não depender do R2. */
  anexos?: React.ReactNode;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const amount = Number(draft.amount.replace(",", "."));
  const parcelas = Number(draft.parcelas);

  const previa =
    draft.modo === "parcelado" &&
    Number.isInteger(parcelas) &&
    parcelas >= 2 &&
    amount > 0 &&
    draft.start_date
      ? `${parcelas}x de ${money(arredondar(amount / parcelas))} — termina em ${monthLabel(
          addMonths(firstDayOfMonth(draft.start_date), parcelas - 1)
        )}`
      : null;

  return (
    <div className="flex flex-col gap-4">
      <Field label="O que foi">
        <input
          className={inputClass}
          value={draft.source}
          autoFocus
          placeholder="Instalação, manutenção, projeto…"
          onChange={(event) => set({ source: event.target.value })}
        />
      </Field>

      <Field label="Cliente" hint="Opcional. Serve pra ver depois quanto cada cliente deu de lucro.">
        <input
          className={inputClass}
          value={draft.client}
          list="clientes-recebimento"
          maxLength={80}
          placeholder="Nome do cliente"
          onChange={(event) => set({ client: event.target.value })}
        />
        <datalist id="clientes-recebimento">
          {clientes.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>

      <SegmentedField
        label="Como o cliente paga"
        value={draft.modo}
        onChange={(modo) => set({ modo })}
        options={(["avista", "parcelado", "mensal"] as Modo[]).map((modo) => ({
          value: modo,
          label: MODO_LABEL[modo],
        }))}
      />

      {/* Pra saber depois por onde o dinheiro entrou (migração 020). */}
      <div className="flex flex-col gap-1.5">
        <SegmentedField
          label="Forma de pagamento"
          value={draft.forma}
          onChange={(forma) => set({ forma })}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABEL[m] }))}
        />
        <span className="text-xs text-[var(--color-text-faint)]">
          Opcional. Pix, cartão, dinheiro, boleto ou cheque.
        </span>
      </div>

      <Field
        label={draft.modo === "parcelado" ? "Valor total" : draft.modo === "mensal" ? "Valor por mês" : "Valor"}
        hint={draft.modo === "parcelado" ? "O valor total do serviço. Nós dividimos pelas parcelas." : undefined}
      >
        <input
          className={`${inputClass} money`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={draft.amount}
          onChange={(event) => set({ amount: event.target.value })}
        />
      </Field>

      {draft.modo === "parcelado" && (
        <Field label="Número de parcelas" hint={previa ?? undefined}>
          <input
            className={inputClass}
            type="number"
            inputMode="numeric"
            min="2"
            max="120"
            step="1"
            placeholder="2"
            value={draft.parcelas}
            onChange={(event) => set({ parcelas: event.target.value })}
          />
        </Field>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label={
            draft.modo === "avista" ? "Data" : draft.modo === "parcelado" ? "Primeira parcela" : "Começa em"
          }
        >
          <input
            className={inputClass}
            type="date"
            value={draft.start_date}
            onChange={(event) => set({ start_date: event.target.value })}
          />
        </Field>

        {draft.modo === "mensal" && (
          <Field label="Termina em" hint="Deixe vazio se não tem fim.">
            <input
              className={inputClass}
              type="date"
              value={draft.end_date}
              onChange={(event) => set({ end_date: event.target.value })}
            />
          </Field>
        )}
      </div>

      {/* Na edição só no à vista: parcelado se marca pelas bolinhas, "todo mês" em "A receber". */}
      {podeMarcar && (draft.id ? draft.modo === "avista" : draft.modo !== "mensal") && (
        <SegmentedField
          label={draft.modo === "parcelado" ? "A 1ª parcela já caiu na conta?" : "Já caiu na conta?"}
          value={draft.jaRecebido ? "sim" : "nao"}
          onChange={(v) => set({ jaRecebido: v === "sim" })}
          options={[
            { value: "sim", label: "Já caiu" },
            { value: "nao", label: "Ainda não" },
          ]}
        />
      )}

      {socios.length > 0 && (
        <Field
          label="Onde o dinheiro cai"
          hint="Na conta de um sócio = ele fica devendo à empresa (aparece no Acerto)."
        >
          <select
            className={inputClass}
            value={draft.caiuEm}
            onChange={(event) => set({ caiuEm: event.target.value })}
          >
            <option value="">Conta da empresa</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                Conta de {s.display_name.split(" ")[0]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {anexos}

      <Field label="Observação" hint="Opcional">
        <input
          className={inputClass}
          value={draft.notes}
          onChange={(event) => set({ notes: event.target.value })}
        />
      </Field>
    </div>
  );
}

/** Estado lembrado no navegador. Sem acesso ao armazenamento, só não lembra. */
function useLembrado(chave: string, inicial: boolean): [boolean, (v: boolean) => void] {
  const [valor, setValor] = useState(inicial);
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(chave);
      if (salvo !== null) setValor(salvo === "1");
    } catch {}
  }, [chave]);
  const mudar = (v: boolean) => {
    setValor(v);
    try {
      window.localStorage.setItem(chave, v ? "1" : "0");
    } catch {}
  };
  return [valor, mudar];
}

/** Título de seção que abre e fecha, com a setinha. */
function TituloRecolhivel({
  titulo,
  detalhe,
  aberto,
  onToggle,
}: {
  titulo: string;
  detalhe?: string;
  aberto: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={aberto}
      className="flex min-h-9 w-full items-center justify-between gap-2 text-left text-xs font-semibold uppercase tracking-wider text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)]"
    >
      <span>
        {titulo}
        {detalhe && <span className="ml-2 font-normal normal-case tracking-normal">{detalhe}</span>}
      </span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={`shrink-0 transition-transform ${aberto ? "rotate-180" : ""}`}
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
