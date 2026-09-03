"use client";

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
