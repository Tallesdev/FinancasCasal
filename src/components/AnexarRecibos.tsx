"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useScope } from "./ScopeProvider";
import { Button, DeleteButton, ErrorNote } from "./ui";
import {
  ErroRecibo,
  apagarRecibo,
  enviarRecibo,
  lerReciboComIA,
  urlDoRecibo,
} from "@/lib/recibos";
import type { Receipt, ReciboLido } from "@/lib/types";

/**
 * Anexar foto de recibo a um gasto (FASE_E.md §3.5).
 *
 * Some por inteiro se o R2 não está configurado — como o áudio, o resto do
 * app segue igual.
 *
 * Sem consentimento, o botão abre a explicação em vez da câmera (§3.6). O
 * servidor confere de novo antes de assinar o envio: a tela é conveniência,
 * não a trava.
 */
export function AnexarRecibos({
  recibos,
  onChange,
  data,
  expenseId,
  onLeitura,
  categorias = [],
  textoBotao = "Anexar recibo",
}: {
  recibos: Receipt[];
  onChange: (recibos: Receipt[]) => void;
  /** Data do gasto. É por ela que a tela de recibos agrupa. */
  data: string;
  /** Nulo em gasto novo: a foto sobe solta e é ligada ao salvar. */
  expenseId: string | null;
  /** Recebe a sugestão da IA e devolve o que foi feito com ela, pra mostrar. */
  onLeitura?: (leitura: ReciboLido) => string;
  categorias?: string[];
  textoBotao?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { me, recursos } = useScope();
  const inputId = useId();

  const [consentido, setConsentido] = useState(Boolean(me.receipts_consent_at));
  const [explicando, setExplicando] = useState(false);
  const [enviando, setEnviando] = useState(0);
  const [lendo, setLendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<{ msg: string; detalhe?: string } | null>(null);

  // Consentimento retirado ou dado em outra tela chega aqui pelo refresh do layout.
  useEffect(() => {
    setConsentido(Boolean(me.receipts_consent_at));
  }, [me.receipts_consent_at]);

  if (!recursos.recibos) return null;

  async function consentir() {
    setError(null);
    const { error: e } = await supabase
      .from("profiles")
      .update({ receipts_consent_at: new Date().toISOString() })
      .eq("id", me.id);
    if (e) return setError({ msg: "Não deu para salvar. Tente de novo." });
    setConsentido(true);
    setExplicando(false);
    // Atualiza o perfil no layout, pra Ajustes mostrar "permitido".
    router.refresh();
  }

  async function escolher(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setError(null);
    setAviso(null);

    let lista = recibos;
    const fila = Array.from(arquivos).slice(0, 5);
    setEnviando(fila.length);

    for (const arquivo of fila) {
      try {
        const recibo = await enviarRecibo({ arquivo, data, expenseId });
        lista = [...lista, recibo];
        onChange(lista);
      } catch (e) {
        setError(
          e instanceof ErroRecibo
            ? { msg: e.message, detalhe: e.detalhe }
            : { msg: "Não deu para enviar a foto.", detalhe: String(e) }
        );
      }
      setEnviando((n) => n - 1);
    }
  }

  async function remover(id: string) {
    setError(null);
    try {
      await apagarRecibo(id);
      onChange(recibos.filter((r) => r.id !== id));
    } catch (e) {
      setError({ msg: e instanceof Error ? e.message : "Não deu para apagar." });
    }
  }

  async function ler(id: string) {
    if (!onLeitura) return;
    setError(null);
    setAviso(null);
    setLendo(id);
    try {
      const leitura = await lerReciboComIA(id, categorias);
      setAviso(onLeitura(leitura));
    } catch (e) {
      setError(
        e instanceof ErroRecibo
          ? { msg: e.message, detalhe: e.detalhe }
          : { msg: "Não deu para ler o recibo." }
      );
    } finally {
      setLendo(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-sm font-medium text-[var(--color-text-dim)]">Recibo</span>

      {recibos.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {recibos.map((r) => (
            <li key={r.id} className="flex w-24 flex-col items-center gap-1">
              <a
                href={urlDoRecibo(r.id)}
                target="_blank"
                rel="noreferrer"
                className="block h-28 w-24 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)]"
                aria-label="Ver recibo"
              >
                <img
                  src={urlDoRecibo(r.id)}
                  alt="Recibo"
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
              {onLeitura && recursos.lerRecibo && (
                <Button
                  variant="quiet"
                  className="px-2 py-0.5 text-xs"
                  onClick={() => ler(r.id)}
                  disabled={lendo !== null}
                >
                  {lendo === r.id ? "Lendo…" : "Ler recibo"}
                </Button>
              )}
              <DeleteButton onConfirm={() => remover(r.id)} label="Remover" />
            </li>
          ))}
        </ul>
      )}

      {explicando && !consentido ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-3 text-sm text-[var(--color-text-dim)]">
          <p className="font-medium text-[var(--color-text)]">Antes de guardar o primeiro recibo</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>A foto fica guardada na sua conta, e só você vê — nem as pessoas da casa.</li>
            <li>Recibo pode conter dado de saúde, como o de uma farmácia.</li>
            <li>
              A câmera só abre quando você toca em &ldquo;Tirar foto&rdquo;, e quem tira é o
              app de câmera do aparelho — este app não acessa a câmera sozinho nem grava vídeo.
            </li>
            <li>Você pode apagar qualquer recibo, ou retirar esta permissão em Ajustes.</li>
            {recursos.lerRecibo && (
              <li>
                Se usar &ldquo;Ler recibo&rdquo;, a foto é enviada a um provedor de
                inteligência artificial fora do Brasil.
              </li>
            )}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={consentir}>Permitir</Button>
            <Button variant="ghost" onClick={() => setExplicando(false)}>
              Agora não
            </Button>
          </div>
        </div>
      ) : consentido ? (
        <div className="flex flex-wrap gap-2">
          {/*
            Dois caminhos, porque são dois momentos: o recibo na mão agora
            (câmera) e o que já está no rolo da câmera (galeria). Com um
            seletor só, a escolha ficava com o sistema — e no Android ele
            costuma abrir a galeria e esconder a câmera.

            `capture` abre a câmera pelo próprio sistema e devolve a foto
            pronta: o app não acessa a câmera, não pede permissão de câmera
            no navegador e não consegue gravar nada por conta própria. É por
            isso que não existe uma segunda permissão aqui — a pessoa tira a
            foto e escolhe enviar, uma ação de cada vez.
          */}
          <Anexo
            id={inputId + "-camera"}
            rotulo={enviando > 0 ? "Enviando…" : "Tirar foto"}
            desativado={enviando > 0}
            camera
            onEscolher={escolher}
          />
          <Anexo
            id={inputId + "-galeria"}
            rotulo="Escolher da galeria"
            desativado={enviando > 0}
            onEscolher={escolher}
          />
        </div>
      ) : (
        <Button variant="ghost" className="min-h-11 w-fit" onClick={() => setExplicando(true)}>
          <Clipe />
          {textoBotao}
        </Button>
      )}

      {aviso && (
        <p className="rounded-lg border border-[var(--scope)]/30 bg-[var(--scope)]/10 px-3.5 py-2.5 text-sm">
          {aviso}
        </p>
      )}

      {error && (
        <ErrorNote>
          {error.msg}
          {error.detalhe && (
            <span className="mt-1 block text-xs opacity-70">Detalhe técnico: {error.detalhe}</span>
          )}
        </ErrorNote>
      )}

      {!expenseId && recibos.length > 0 && (
        <span className="text-xs text-[var(--color-text-faint)]">
          Se cancelar o gasto, a foto continua em Recibos, sem lançamento.
        </span>
      )}
    </div>
  );
}

/**
 * Um campo de arquivo com cara de botão. `<label>` em vez de botão com
 * click(): no iOS, abrir a câmera exige que o toque seja direto no campo.
 */
function Anexo({
  id,
  rotulo,
  desativado,
  camera = false,
  onEscolher,
}: {
  id: string;
  rotulo: string;
  desativado: boolean;
  camera?: boolean;
  onEscolher: (arquivos: FileList | null) => void;
}) {
  return (
    <label
      htmlFor={id}
      aria-disabled={desativado}
      className={[
        "inline-flex min-h-11 w-fit cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-line)] px-4 text-sm font-semibold text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
        desativado ? "pointer-events-none opacity-50" : "",
      ].join(" ")}
    >
      {camera ? <Camera /> : <Clipe />}
      {rotulo}
      <input
        id={id}
        type="file"
        // Sem "image/*": listando os formatos que o servidor aceita, o
        // iPhone converte HEIC em JPEG ao enviar, em vez de mandar HEIC
        // (que Chrome e Android não abrem).
        accept="image/jpeg,image/png,image/webp"
        // "environment" é a câmera de trás — a que fotografa papel.
        {...(camera ? { capture: "environment" as const } : { multiple: true })}
        className="sr-only"
        onChange={(event) => {
          onEscolher(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function Camera({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function Clipe({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
