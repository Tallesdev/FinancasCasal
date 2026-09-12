"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import type { GastoInterpretado } from "@/lib/ia";

/** Segundos. Dá pra descrever um gasto inteiro sobrando tempo. */
const DURACAO_MAXIMA = 30;

export type GastoPorAudio = GastoInterpretado & { texto: string };

type Estado = "parado" | "gravando" | "enviando";

/**
 * Botão de microfone. Grava, manda pra /api/audio, devolve a sugestão pro
 * pai abrir o formulário preenchido. Nunca salva sozinho.
 */
export function GravarGasto({
  categorias,
  onDraft,
}: {
  categorias: string[];
  onDraft: (gasto: GastoPorAudio) => void;
}) {
  const [estado, setEstado] = useState<Estado>("parado");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suportado, setSuportado] = useState(true);

  const recorder = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSuportado(
      typeof window !== "undefined" &&
        "MediaRecorder" in window &&
        Boolean(navigator.mediaDevices?.getUserMedia)
    );
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** Chrome/Android gravam webm/opus; Safari iOS grava mp4. */
  function escolherMime() {
    const opcoes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    return opcoes.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
  }

  async function comecar() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = escolherMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      pedacos.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        enviar(new Blob(pedacos.current, { type: rec.mimeType || mime || "audio/webm" }));
      };

      recorder.current = rec;
      rec.start();
      setEstado("gravando");
      setSegundos(0);
      timer.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= DURACAO_MAXIMA) parar();
          return s + 1;
        });
      }, 1000);
    } catch {
      setError("Não deu para usar o microfone. Confira a permissão do navegador.");
    }
  }

  function parar() {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  async function enviar(audio: Blob) {
    setEstado("enviando");
    try {
      const form = new FormData();
      form.append("audio", audio);
      form.append("categorias", JSON.stringify(categorias));

      const r = await fetch("/api/audio", { method: "POST", body: form });
      const json = (await r.json()) as
        | { texto: string; gasto: GastoInterpretado }
        | { error: string };

      if (!r.ok || "error" in json) {
        setError("error" in json ? json.error : "Não deu para processar o áudio.");
        return;
      }
      onDraft({ ...json.gasto, texto: json.texto });
    } catch {
      setError("Sem conexão. Tente de novo ou digite o gasto.");
    } finally {
      setEstado("parado");
    }
  }

  if (!suportado) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {estado === "gravando" ? (
        <Button variant="danger" onClick={parar} aria-label="Parar gravação">
          <Pulso /> {segundos}s · Parar
        </Button>
      ) : (
        <Button
          variant="ghost"
          onClick={comecar}
          disabled={estado === "enviando"}
          aria-label="Lançar gasto por áudio"
          title="Fale o gasto: o formulário abre preenchido pra você conferir"
        >
          <Microfone />
          {estado === "enviando" ? "Ouvindo…" : "Por áudio"}
        </Button>
      )}
      {error && (
        <p role="alert" className="max-w-[16rem] text-right text-xs text-[var(--color-out)]">
          {error}
        </p>
      )}
    </div>
  );
}

function Microfone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
    </svg>
  );
}

function Pulso() {
  return (
    <span aria-hidden="true" className="relative inline-flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-current" />
    </span>
  );
}
