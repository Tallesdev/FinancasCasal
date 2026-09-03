"use client";

import { useScope } from "./ScopeProvider";

export function ScopeToggle() {
  const { scope, setScope, me, partner } = useScope();

  const firstName = (full: string) => full.split(" ")[0];

  const options: { value: "me" | "us"; label: string }[] = [
    { value: "me", label: firstName(me.display_name) },
    {
      value: "us",
      label: partner ? `${firstName(me.display_name)} + ${firstName(partner.display_name)}` : "Nós dois",
    },
  ];

  return (
    <div
      role="group"
      aria-label="Escolher de quem são os números"
      className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] p-1"
    >
      {options.map((option) => {
        const active = scope === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setScope(option.value)}
            className={[
              "flex min-h-11 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
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
  );
}
