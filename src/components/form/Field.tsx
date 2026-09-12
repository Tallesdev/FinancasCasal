"use client";

import { useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

/**
 * Campos de formulário do app inteiro nascem aqui. Duas coisas resolvidas
 * de uma vez, pra ninguém precisar redescobrir:
 *
 * 1. iOS Safari dá zoom na página quando o campo focado tem fonte < 16px.
 *    (globals.css já trava isso globalmente; aqui reforça inline pra não
 *    depender de nenhuma classe do Tailwind conseguir sobrescrever.)
 * 2. Todo campo tocável tem no mínimo 44px de altura (alvo de toque da Apple).
 */

const baseInputClass =
  "w-full min-h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-couple)] disabled:opacity-50";

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm font-medium text-[var(--color-text-dim)]">
      {children}
    </span>
  );
}

type BaseProps = InputHTMLAttributes<HTMLInputElement> & { label: string };

export function TextField({ label, className, style, ...props }: BaseProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        {...props}
        style={{ fontSize: "16px", ...style }}
        className={[baseInputClass, className].filter(Boolean).join(" ")}
      />
    </label>
  );
}

/**
 * Campo de senha com olhinho pra conferir o que foi digitado. Sem isso, em
 * teclado de celular, errar a senha e não saber onde é rotina.
 *
 * O botão fica DENTRO do campo, à direita, com padding à direita no input
 * pra não cobrir o texto.
 */
export function PasswordField({ label, className, style, ...props }: BaseProps) {
  const [visivel, setVisivel] = useState(false);

  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          {...props}
          type={visivel ? "text" : "password"}
          style={{ fontSize: "16px", ...style }}
          className={[baseInputClass, "pr-12", className].filter(Boolean).join(" ")}
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? "Esconder senha" : "Mostrar senha"}
          title={visivel ? "Esconder senha" : "Mostrar senha"}
          className="absolute right-1 top-1/2 flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-faint)] transition-colors hover:text-[var(--color-text)]"
        >
          {visivel ? <OlhoFechado /> : <Olho />}
        </button>
      </div>
    </label>
  );
}

function Olho() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OlhoFechado() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1" />
      <path d="M6.2 6.2A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

export function DateField({ label, className, style, ...props }: BaseProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        type="date"
        {...props}
        style={{ fontSize: "16px", ...style }}
        className={[baseInputClass, "leading-none", className].filter(Boolean).join(" ")}
      />
    </label>
  );
}

export function NumberField({
  label,
  prefix,
  className,
  style,
  ...props
}: BaseProps & { prefix?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]">
            {prefix}
          </span>
        )}
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          {...props}
          style={{ fontSize: "16px", ...style }}
          className={[baseInputClass, prefix ? "pl-9" : "", className]
            .filter(Boolean)
            .join(" ")}
        />
      </div>
    </label>
  );
}

export function SelectField({
  label,
  children,
  className,
  style,
  ...props
}: InputHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode } & {
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  value?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <select
        {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
        style={{ fontSize: "16px", ...style }}
        className={[baseInputClass, "appearance-none", className]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </select>
    </label>
  );
}

type SegmentedOption<T extends string> = { value: T; label: string };

/**
 * Toggle de poucas opções (ex: avulso/recorrente, fixo/variável).
 * Cada opção some pra próxima linha (`flex-wrap`) em vez de espremer,
 * então não desaparece atrás de outro campo em tela estreita.
 */
export function SegmentedField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-1"
      >
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={[
                "min-h-10 flex-1 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[var(--scope)] text-[var(--color-ink)]"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
