"use client";

import { useEffect, useState } from "react";
import { PALETTE } from "@/lib/palette";
import { monthLabel } from "@/lib/format";

/* =====================================================================
   Peças de interface reaproveitadas por todas as telas.
   Mobile-first: formulário abre como folha vinda de baixo no celular
   e como caixa centralizada no desktop.
   ===================================================================== */

/**
 * Campo usado pelas telas que já existiam. Mesmas duas garantias dos
 * componentes de `form/Field.tsx`: 16px de fonte (senão o iOS dá zoom ao
 * focar) e 44px de altura de toque.
 */
export const inputClass =
  "w-full min-h-11 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3.5 py-2.5 text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-faint)] focus:border-[var(--scope)] disabled:opacity-50";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-medium text-[var(--color-text-dim)]">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs text-[var(--color-text-faint)]">{hint}</span>
      )}
    </label>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "quiet";
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40";

  const look = {
    primary: "bg-[var(--scope)] text-[var(--color-ink)] hover:opacity-90",
    ghost:
      "border border-[var(--color-line)] bg-transparent text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
    danger:
      "border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 text-[var(--color-out)] hover:bg-[var(--color-out)]/20",
    quiet: "text-[var(--color-text-faint)] hover:text-[var(--color-text)]",
  }[variant];

  return <button className={`${base} ${look} ${className}`} {...props} />;
}

export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <span className="scope-rule mb-3 block h-1 w-10 rounded-full" />
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--color-line)] bg-[var(--color-surface)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <Button variant="quiet" onClick={onClose} className="px-2 py-1">
            Fechar
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      <p className="max-w-xs text-sm text-[var(--color-text-dim)]">
        {description}
      </p>
      {action}
    </div>
  );
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="card px-6 py-14 text-center text-sm text-[var(--color-text-dim)]">
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-[var(--color-out)]/40 bg-[var(--color-out)]/10 px-3.5 py-2.5 text-sm text-[var(--color-out)]"
    >
      {children}
    </p>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
      {PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Cor ${color}`}
          onClick={() => onChange(color)}
          style={{ background: color }}
          className={[
            "h-8 w-8 rounded-full transition-transform",
            value === color
              ? "scale-110 ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-surface)]"
              : "opacity-70 hover:opacity-100",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

/** Confirmação em dois toques: o segundo clique é que apaga de verdade. */
export function DeleteButton({
  onConfirm,
  label = "Excluir",
}: {
  onConfirm: () => void;
  label?: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      variant={armed ? "danger" : "quiet"}
      className="px-2 py-1 text-xs"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? "Confirmar?" : label}
    </Button>
  );
}

export function MonthNav({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const shift = (count: number) => {
    const [y, m] = month.split("-").map(Number);
    const date = new Date(y, m - 1 + count, 1);
    onChange(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`
    );
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1">
      <button
        type="button"
        aria-label="Mês anterior"
        onClick={() => shift(-1)}
        className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      >
        &lsaquo;
      </button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        aria-label="Próximo mês"
        onClick={() => shift(1)}
        className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
      >
        &rsaquo;
      </button>
    </div>
  );
}

/** Ponto colorido que identifica categoria ou cartão na lista. */
export function Dot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{ background: color ?? "#8B93A7" }}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
    />
  );
}

/** Etiqueta neutra para tipo, forma de pagamento, parcela. */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-text-dim)]">
      {children}
    </span>
  );
}

/** Marca de quem é o lançamento, usada na visão do casal. */
export function OwnerTag({ name, accent }: { name: string; accent: "a" | "b" }) {
  const color =
    accent === "b" ? "var(--color-person-b)" : "var(--color-person-a)";
  return (
    <span
      style={{ color, borderColor: `${color}55` }}
      className="rounded-md border px-1.5 py-0.5 text-[11px] font-medium"
    >
      {name.split(" ")[0]}
    </span>
  );
}
