"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "@/components/ScopeProvider";
import { SegmentedField } from "@/components/form/Field";
import { CartaoAtendimento, corDoAtendimento } from "@/components/CartaoAtendimento";
import {
  Button,
  DeleteButton,
  EmptyState,
  ErrorNote,
  Field,
  Loading,
  MonthNav,
  PageTitle,
  Sheet,
  Tag,
  inputClass,
} from "@/components/ui";
import {
  INICIAIS_SEMANA,
  buscarAgenda,
  diaPorExtenso,
  faixaDeHorario,
  hora,
  ordenarDoDia,
  semanasDoMes,
  ultimoDiaDoMes,
} from "@/lib/agenda";
import {
  enderecoDoCliente,
  linkMapa,
  linkWhatsApp,
  listarClientes,
  listarServicos,
  normalizar,
  salvarCliente,
  ultimosClientes,
  ultimosServicos,
} from "@/lib/orcamentos-app";
import { firstDayOfMonth, formatDate, toISODate } from "@/lib/format";
import {
  APPOINTMENT_STATUS_LABEL,
  type Appointment,
  type AppointmentService,
  type AppointmentStatus,
  type OrcCliente,
  type OrcServico,
} from "@/lib/types";

type Draft = {
  id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  client_id: string | null;
  client_name: string;
  client_phone: string;
  client_address: string;
  /** Cliente digitado: cadastrar também nos clientes (o mesmo dos orçamentos). */
  cadastrar: boolean;
  services: AppointmentService[];
  details: string;
  /** "" = qualquer um. */
  assigned_to: string;
  status: AppointmentStatus;
};

const novoDraft = (date: string): Draft => ({
  id: null,
  date,
  start_time: "",
  end_time: "",
  client_id: null,
  client_name: "",
  client_phone: "",
  client_address: "",
  cadastrar: true,
  services: [],
  details: "",
  assigned_to: "",
  status: "marcado",
});

/**
 * Agenda da empresa (C29): os clientes marcados em cada dia, com o que foi
 * combinado. Os dois sócios veem e marcam — é pra ninguém depender de o
 * outro lembrar de contar.
 */
export default function AgendaPage() {
  const supabase = useMemo(() => createClient(), []);
  const { empresa, members, recursos } = useScope();
  const hoje = useMemo(() => toISODate(new Date()), []);

  const [mes, setMes] = useState(() => firstDayOfMonth(hoje));
  const [dia, setDia] = useState(hoje);
  const [atendimentos, setAtendimentos] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Appointment | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // Cadastros dos orçamentos, pro formulário. Vêm por trás.
  const [clientes, setClientes] = useState<OrcCliente[]>(() => ultimosClientes() ?? []);
  const [servicos, setServicos] = useState<OrcServico[]>(() => ultimosServicos() ?? []);

  const carregar = useCallback(async () => {
    const lista = await buscarAgenda(supabase, mes, ultimoDiaDoMes(mes));
    if (!lista) setError("Não deu para carregar a agenda. A migração 023 pode não ter rodado ainda.");
    else {
      setError(null);
      setAtendimentos(lista);
    }
    setLoading(false);
  }, [supabase, mes]);

  useEffect(() => {
    if (!empresa) return;
    setLoading(true);
    carregar();
  }, [carregar, empresa]);

  useEffect(() => {
    if (!empresa || !recursos.orcamentos) return;
    listarClientes().then(setClientes).catch(() => {});
    listarServicos().then(setServicos).catch(() => {});
  }, [empresa, recursos.orcamentos]);

  const porDia = useMemo(() => {
    const mapa: Record<string, Appointment[]> = {};
    for (const a of atendimentos) (mapa[a.date] ??= []).push(a);
    return mapa;
  }, [atendimentos]);

  const membro = useCallback(
    (id: string | null) => (id ? members.find((m) => m.id === id) : undefined),
    [members]
  );

  if (!empresa) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle title="Agenda" />
        <EmptyState title="Só no modo empresa" description="A agenda de clientes é do modo empresa." />
      </div>
    );
  }

  const doDia = ordenarDoDia(porDia[dia] ?? []);
  const semanas = semanasDoMes(mes);

  function trocarMes(novo: string) {
    setMes(novo);
    // Fica no dia de hoje quando volta pro mês atual; senão, no dia 1.
    setDia(novo === firstDayOfMonth(hoje) ? hoje : novo);
  }

  function editar(a: Appointment) {
    setAberto(null);
    setDraft({
      id: a.id,
      date: a.date,
      start_time: hora(a.start_time) ?? "",
      end_time: hora(a.end_time) ?? "",
      client_id: a.client_id,
      client_name: a.client_name,
      client_phone: a.client_phone ?? "",
      client_address: a.client_address ?? "",
      cadastrar: false,
      services: a.services ?? [],
      details: a.details ?? "",
      assigned_to: a.assigned_to ?? "",
      status: a.status,
    });
  }

  async function mudarStatus(a: Appointment, status: AppointmentStatus) {
    const { data, error: e } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", a.id)
      .select("*")
      .single();
    if (e || !data) return setError("Não deu para mudar o atendimento.");
    setAtendimentos((lista) => lista.map((x) => (x.id === a.id ? (data as Appointment) : x)));
    setAberto(data as Appointment);
  }

  async function apagar(a: Appointment) {
    const { error: e } = await supabase.from("appointments").delete().eq("id", a.id);
    if (e) return setError("Não deu para apagar o atendimento.");
    setAtendimentos((lista) => lista.filter((x) => x.id !== a.id));
    setAberto(null);
  }

  function aoSalvar(a: Appointment) {
    setDraft(null);
    // Saiu do mês que está na tela: vai pra ele, pra pessoa ver onde ficou.
    if (firstDayOfMonth(a.date) !== mes) {
      setMes(firstDayOfMonth(a.date));
    } else {
      setAtendimentos((lista) => [...lista.filter((x) => x.id !== a.id), a]);
    }
    setDia(a.date);
  }

  return (
    <div className="flex flex-col gap-5">
      <PageTitle
        title="Agenda"
        description="Os clientes marcados em cada dia. Os dois sócios veem e marcam."
        action={<Button onClick={() => setDraft(novoDraft(dia))}>Marcar cliente</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={mes} onChange={trocarMes} />
        {(mes !== firstDayOfMonth(hoje) || dia !== hoje) && (
          <Button
            variant="ghost"
            className="py-1.5"
            onClick={() => {
              setMes(firstDayOfMonth(hoje));
              setDia(hoje);
            }}
          >
            Hoje
          </Button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Grade do mês */}
      <div className="card overflow-hidden p-2 sm:p-3">
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold text-[var(--color-text-faint)]">
          {INICIAIS_SEMANA.map((d, i) => (
            <span key={i} className={i === 0 ? "text-[var(--color-out)]" : ""}>
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {semanas.flat().map((iso, i) => {
            if (!iso) return <span key={`v${i}`} />;
            const lista = (porDia[iso] ?? []).filter((a) => a.status !== "cancelado");
            const selecionado = iso === dia;
            const eHoje = iso === hoje;
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setDia(iso)}
                aria-pressed={selecionado}
                aria-label={`${diaPorExtenso(iso)}${lista.length ? `, ${lista.length} ${lista.length === 1 ? "cliente" : "clientes"}` : ""}`}
                className={[
                  "flex min-h-14 flex-col items-center gap-1 rounded-lg border px-0.5 pb-1.5 pt-1 text-sm transition-colors sm:min-h-20 sm:items-stretch sm:px-1.5",
                  selecionado
                    ? "border-[var(--scope)] bg-[var(--scope)]/15"
                    : lista.length
                      ? "border-[var(--color-line)] bg-[var(--color-surface-2)]"
                      : "border-transparent hover:border-[var(--color-line)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold sm:self-start",
                    eHoje ? "bg-[var(--scope)] text-[var(--color-ink)]" : "",
                  ].join(" ")}
                >
                  {Number(iso.slice(8))}
                </span>
                {/* Celular: pontinhos. Computador: os nomes. */}
                {lista.length > 0 && (
                  <>
                    <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {lista.slice(0, 3).map((a) => (
                        <span
                          key={a.id}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: corDoAtendimento(a, membro(a.assigned_to)?.color) }}
                        />
                      ))}
                      {lista.length > 3 && (
                        <span className="text-[9px] leading-none text-[var(--color-text-dim)]">+{lista.length - 3}</span>
                      )}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {ordenarDoDia(lista)
                        .slice(0, 2)
                        .map((a) => (
                          <span
                            key={a.id}
                            className="truncate rounded px-1 text-left text-[11px] leading-4"
                            style={{
                              // A cor pode ser var(--…): color-mix serve pros dois.
                              background: `color-mix(in srgb, ${corDoAtendimento(a, membro(a.assigned_to)?.color)} 15%, transparent)`,
                              color: corDoAtendimento(a, membro(a.assigned_to)?.color),
                            }}
                          >
                            {hora(a.start_time) ? `${hora(a.start_time)} ` : ""}
                            {a.client_name}
                          </span>
                        ))}
                      {lista.length > 2 && (
                        <span className="text-left text-[10px] text-[var(--color-text-dim)]">+{lista.length - 2}</span>
                      )}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* O dia escolhido */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {dia === hoje ? `Hoje · ${diaPorExtenso(dia)}` : diaPorExtenso(dia)}
          </h2>
          <Button variant="quiet" className="px-2 py-1 text-xs" onClick={() => setDraft(novoDraft(dia))}>
            + Marcar neste dia
          </Button>
        </div>

        {loading ? (
          <Loading />
        ) : doDia.length === 0 ? (
          <p className="card px-4 py-5 text-center text-sm text-[var(--color-text-faint)]">
            Nenhum cliente marcado.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {doDia.map((a) => (
              <li key={a.id}>
                <CartaoAtendimento
                  a={a}
                  atende={membro(a.assigned_to)}
                  marcou={membro(a.created_by)}
                  onClick={() => setAberto(a)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {aberto && (
        <Sheet title={aberto.client_name} onClose={() => setAberto(null)}>
          <Detalhe
            a={aberto}
            atende={membro(aberto.assigned_to)}
            marcou={membro(aberto.created_by)}
            onEditar={() => editar(aberto)}
            onStatus={(s) => mudarStatus(aberto, s)}
            onApagar={() => apagar(aberto)}
          />
        </Sheet>
      )}

      {draft && (
        <Sheet title={draft.id ? "Editar atendimento" : "Marcar cliente"} onClose={() => setDraft(null)}>
          <FormAtendimento
            draft={draft}
            setDraft={setDraft}
            clientes={clientes}
            servicos={servicos}
            cadastrosLigados={recursos.orcamentos}
            socios={members}
            onSalvo={aoSalvar}
            onCancelar={() => setDraft(null)}
          />
        </Sheet>
      )}
    </div>
  );
}

type Membro = { id: string; display_name: string; color: string } | undefined;

function Detalhe({
  a,
  atende,
  marcou,
  onEditar,
  onStatus,
  onApagar,
}: {
  a: Appointment;
  atende: Membro;
  marcou: Membro;
  onEditar: () => void;
  onStatus: (s: AppointmentStatus) => void;
  onApagar: () => void;
}) {
  const zap = linkWhatsApp(a.client_phone);
  const mapa = linkMapa(a.client_address);
  const horario = faixaDeHorario(a);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-dim)]">
        <span>{diaPorExtenso(a.date)}</span>
        <span>· {horario ?? "sem horário"}</span>
        <Tag>{APPOINTMENT_STATUS_LABEL[a.status]}</Tag>
      </div>

      {(a.client_phone || a.client_address) && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-line)] px-3.5 py-3 text-sm">
          {a.client_phone && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>{a.client_phone}</span>
              <span className="flex gap-2">
                <a
                  href={`tel:${a.client_phone.replace(/[^\d+]/g, "")}`}
                  className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold"
                >
                  Ligar
                </a>
                {zap && (
                  <a
                    href={zap}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-in)]"
                  >
                    WhatsApp
                  </a>
                )}
              </span>
            </div>
          )}
          {a.client_address && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words">{a.client_address}</span>
              {mapa && (
                <a
                  href={mapa}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold"
                >
                  Mapa
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Serviços combinados</h3>
        {a.services.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {a.services.map((s, i) => (
              <li
                key={`${s.catalog_id ?? s.name}-${i}`}
                className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1 text-sm"
              >
                {s.name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--color-text-faint)]">Nenhum serviço escolhido.</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Detalhes do serviço</h3>
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--color-text-dim)]">
          {a.details || "Sem detalhes."}
        </p>
      </div>

      <p className="text-xs text-[var(--color-text-faint)]">
        {atende ? `Quem atende: ${atende.display_name.split(" ")[0]}. ` : "Qualquer um pode atender. "}
        {marcou ? `Marcado por ${marcou.display_name.split(" ")[0]} em ${formatDate(a.created_at)}.` : ""}
      </p>

      <div className="flex flex-wrap gap-2">
        {a.status === "marcado" ? (
          <Button onClick={() => onStatus("feito")} className="flex-1">
            Marcar como feito
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => onStatus("marcado")} className="flex-1">
            Voltar para marcado
          </Button>
        )}
        <Button variant="ghost" onClick={onEditar}>
          Editar
        </Button>
        {a.status === "marcado" && (
          <Button variant="ghost" onClick={() => onStatus("cancelado")}>
            Cliente cancelou
          </Button>
        )}
        <DeleteButton onConfirm={onApagar} label="Apagar" />
      </div>
    </div>
  );
}

function FormAtendimento({
  draft,
  setDraft,
  clientes,
  servicos,
  cadastrosLigados,
  socios,
  onSalvo,
  onCancelar,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  clientes: OrcCliente[];
  servicos: OrcServico[];
  cadastrosLigados: boolean;
  socios: { id: string; display_name: string }[];
  onSalvo: (a: Appointment) => void;
  onCancelar: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [buscaServico, setBuscaServico] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const sugestoesCliente = useMemo(() => {
    const termo = normalizar(draft.client_name.trim());
    if (draft.client_id || termo.length < 2) return [];
    const digitos = termo.replace(/\D/g, "");
    return clientes
      .filter(
        (c) =>
          normalizar(c.name).includes(termo) ||
          (digitos.length >= 3 && (c.phone ?? "").replace(/\D/g, "").includes(digitos))
      )
      .slice(0, 6);
  }, [clientes, draft.client_name, draft.client_id]);

  const sugestoesServico = useMemo(() => {
    const termo = normalizar(buscaServico.trim());
    const escolhidos = new Set(draft.services.map((s) => s.catalog_id).filter(Boolean));
    return servicos
      .filter((s) => !escolhidos.has(s.id))
      .filter((s) => !termo || normalizar(s.name).includes(termo))
      .slice(0, termo ? 8 : 6);
  }, [servicos, buscaServico, draft.services]);

  function escolherCliente(c: OrcCliente) {
    set({
      client_id: c.id,
      client_name: c.name,
      client_phone: c.phone ?? "",
      client_address: enderecoDoCliente(c),
      cadastrar: false,
    });
  }

  function adicionarServico(s: AppointmentService) {
    if (!s.name.trim()) return;
    if (draft.services.some((x) => normalizar(x.name) === normalizar(s.name))) return;
    set({ services: [...draft.services, { catalog_id: s.catalog_id, name: s.name.trim() }] });
    setBuscaServico("");
  }

  async function salvar() {
    const nome = draft.client_name.trim();
    if (!draft.date) return setFormError("Escolha o dia.");
    if (!nome) return setFormError("Diga o nome do cliente.");
    if (draft.start_time && draft.end_time && draft.end_time < draft.start_time)
      return setFormError("O fim não pode ser antes do começo.");

    setSaving(true);
    setFormError(null);

    let clientId = draft.client_id;
    // Cliente novo digitado aqui: entra no cadastro (o mesmo dos orçamentos).
    if (!clientId && cadastrosLigados && draft.cadastrar) {
      try {
        const novo = await salvarCliente({
          name: nome,
          phone: draft.client_phone.trim() || null,
          street: draft.client_address.trim() || null,
        });
        clientId = novo.id;
      } catch {
        // Não trava a agenda: marca do mesmo jeito, só sem o cadastro.
        clientId = null;
      }
    }

    const payload = {
      date: draft.date,
      start_time: draft.start_time || null,
      end_time: draft.end_time || null,
      client_id: clientId,
      client_name: nome,
      client_phone: draft.client_phone.trim() || null,
      client_address: draft.client_address.trim() || null,
      services: draft.services,
      details: draft.details.trim() || null,
      assigned_to: draft.assigned_to || null,
      status: draft.status,
    };

    const { data, error } = draft.id
      ? await supabase.from("appointments").update(payload).eq("id", draft.id).select("*").single()
      : await supabase.from("appointments").insert(payload).select("*").single();
    setSaving(false);
    if (error || !data) return setFormError("Não deu para salvar. Confira os campos.");
    onSalvo(data as Appointment);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cliente */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text-dim)]">Cliente</span>
        {draft.client_id ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-[var(--scope)]/40 bg-[var(--scope)]/10 px-3.5 py-2.5">
            <div className="min-w-0 text-sm">
              <p className="font-medium">{draft.client_name}</p>
              {draft.client_phone && <p className="text-[var(--color-text-dim)]">{draft.client_phone}</p>}
              {draft.client_address && <p className="break-words text-[var(--color-text-dim)]">{draft.client_address}</p>}
            </div>
            <Button
              variant="quiet"
              className="shrink-0 px-2 py-1 text-xs"
              onClick={() => set({ client_id: null, client_name: "", client_phone: "", client_address: "", cadastrar: true })}
            >
              Trocar
            </Button>
          </div>
        ) : (
          <>
            <input
              className={inputClass}
              value={draft.client_name}
              autoFocus={!draft.id}
              placeholder={cadastrosLigados ? "Buscar cliente ou digitar um novo" : "Nome do cliente"}
              onChange={(event) => set({ client_name: event.target.value })}
              aria-label="Cliente"
            />
            {sugestoesCliente.length > 0 && (
              <ul className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-line)]">
                {sugestoesCliente.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => escolherCliente(c)}
                      className="flex w-full flex-col px-3.5 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-[var(--color-text-faint)]">
                        {[c.phone, c.district, c.city].filter(Boolean).join(" · ") || "sem telefone"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {!draft.client_id && draft.client_name.trim() && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Telefone" hint="Opcional">
              <input
                className={inputClass}
                inputMode="tel"
                value={draft.client_phone}
                onChange={(event) => set({ client_phone: event.target.value })}
              />
            </Field>
            <Field label="Endereço do serviço" hint="Opcional">
              <input
                className={inputClass}
                value={draft.client_address}
                onChange={(event) => set({ client_address: event.target.value })}
              />
            </Field>
          </div>
          {cadastrosLigados && (
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-dim)]">
              <input
                type="checkbox"
                checked={draft.cadastrar}
                onChange={(event) => set({ cadastrar: event.target.checked })}
                className="h-4 w-4"
              />
              Salvar nos clientes (aparece também no app de orçamentos)
            </label>
          )}
        </>
      )}

      {/* Quando */}
      <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
        <Field label="Dia">
          <input
            type="date"
            className={inputClass}
            value={draft.date}
            onChange={(event) => set({ date: event.target.value })}
          />
        </Field>
        <Field label="De">
          <input
            type="time"
            className={`${inputClass} w-[6.5rem]`}
            value={draft.start_time}
            onChange={(event) => set({ start_time: event.target.value })}
          />
        </Field>
        <Field label="Até">
          <input
            type="time"
            className={`${inputClass} w-[6.5rem]`}
            value={draft.end_time}
            onChange={(event) => set({ end_time: event.target.value })}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-[var(--color-text-faint)]">Horário é opcional.</p>

      {/* Serviços */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-[var(--color-text-dim)]">Serviços combinados</span>
        {draft.services.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {draft.services.map((s, i) => (
              <li key={`${s.catalog_id ?? s.name}-${i}`}>
                <button
                  type="button"
                  onClick={() => set({ services: draft.services.filter((_, j) => j !== i) })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--scope)]/40 bg-[var(--scope)]/10 px-3 py-1 text-sm"
                  aria-label={`Tirar ${s.name}`}
                >
                  {s.name}
                  <span aria-hidden="true" className="text-[var(--color-text-faint)]">
                    ×
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          className={inputClass}
          value={buscaServico}
          placeholder={servicos.length ? "Buscar serviço ou digitar outro" : "Digite o serviço e toque em Adicionar"}
          onChange={(event) => setBuscaServico(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              const exato = servicos.find((s) => normalizar(s.name) === normalizar(buscaServico.trim()));
              adicionarServico(exato ? { catalog_id: exato.id, name: exato.name } : { catalog_id: null, name: buscaServico });
            }
          }}
          aria-label="Buscar serviço"
        />
        {(sugestoesServico.length > 0 || buscaServico.trim()) && (
          <div className="flex flex-wrap gap-1.5">
            {sugestoesServico.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => adicionarServico({ catalog_id: s.id, name: s.name })}
                className="rounded-full border border-[var(--color-line)] px-3 py-1 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
              >
                + {s.name}
              </button>
            ))}
            {buscaServico.trim() &&
              !servicos.some((s) => normalizar(s.name) === normalizar(buscaServico.trim())) && (
                <button
                  type="button"
                  onClick={() => adicionarServico({ catalog_id: null, name: buscaServico })}
                  className="rounded-full border border-dashed border-[var(--color-line)] px-3 py-1 text-sm text-[var(--color-text-dim)]"
                >
                  Adicionar &ldquo;{buscaServico.trim()}&rdquo;
                </button>
              )}
          </div>
        )}
      </div>

      <Field
        label="Detalhes do serviço"
        hint="O geral do que vai ser feito nesse cliente. Não precisa detalhar cada tomada."
      >
        <textarea
          className={`${inputClass} min-h-28`}
          value={draft.details}
          placeholder="Ex.: trocar a fiação da cozinha e da área de serviço, levar escada grande, cliente pediu pra chegar depois das 9h."
          onChange={(event) => set({ details: event.target.value })}
        />
      </Field>

      {socios.length > 1 && (
        <SegmentedField
          label="Quem vai atender"
          value={draft.assigned_to}
          onChange={(v) => set({ assigned_to: v })}
          options={[
            { value: "", label: "Qualquer um" },
            ...socios.map((s) => ({ value: s.id, label: s.display_name.split(" ")[0] })),
          ]}
        />
      )}

      {formError && <ErrorNote>{formError}</ErrorNote>}

      <div className="mt-2 flex gap-2">
        <Button onClick={salvar} disabled={saving} className="flex-1">
          {saving ? "Salvando…" : draft.id ? "Salvar" : "Marcar"}
        </Button>
        <Button variant="ghost" onClick={onCancelar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
