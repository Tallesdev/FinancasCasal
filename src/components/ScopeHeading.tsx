"use client";

import { useScope } from "./ScopeProvider";
import { labelTodos } from "./ScopeToggle";

const firstName = (full: string) => full.split(" ")[0];

/** "Talles, Duda, Ana e Bia" — vírgulas e um "e" antes do último. */
function listar(nomes: string[]) {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export function ScopeHeading() {
  const { scope, me, members } = useScope();

  const todos = scope === "us";
  const title = todos ? labelTodos(members) : firstName(me.display_name);

  const subtitle = todos
    ? `${listar(members.map((m) => firstName(m.display_name)))} — somados.`
    : members.length < 2
      ? "Sua casa, só você por enquanto."
      : "Só o que passa pela sua conta.";

  return (
    <div>
      <span className="scope-rule mb-3 block h-1 w-10 rounded-full" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-dim)]">{subtitle}</p>
    </div>
  );
}
