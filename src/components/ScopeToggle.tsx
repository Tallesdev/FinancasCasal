"use client";

import { useScope } from "./ScopeProvider";

const firstName = (full: string) => full.split(" ")[0];

/**
 * Rótulo do escopo "todos", pelo tamanho da casa:
 *   2 pessoas → "A + B" (o caso do casal, fica bonito)
 *   3 ou mais → "Todos" (seis nomes não cabem num toggle de celular)
 */
export function labelTodos(members: { display_name: string }[]) {
  if (members.length === 2)
    return `${firstName(members[0].display_name)} + ${firstName(members[1].display_name)}`;
  return "Todos";
}

export function ScopeToggle() {
  const { scope, setScope, me, members } = useScope();

  // Sozinho na casa não existe escolha entre "eu" e "eu".
  if (members.length < 2) return null;

  const options: { value: "me" | "us"; label: string }[] = [
    { value: "me", label: firstName(me.display_name) },
    { value: "us", label: labelTodos(members) },
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
