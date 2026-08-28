"use client";

import { useScope } from "./ScopeProvider";

export function ScopeHeading() {
  const { scope, me, partner } = useScope();
  const firstName = (full: string) => full.split(" ")[0];

  const title =
    scope === "us"
      ? partner
        ? `${firstName(me.display_name)} e ${firstName(partner.display_name)}`
        : "Nós dois"
      : firstName(me.display_name);

  return (
    <div>
      <span className="scope-rule mb-3 block h-1 w-10 rounded-full" />
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-[var(--color-text-dim)]">
        {scope === "us"
          ? "Renda, gastos e investimentos dos dois somados."
          : "Só o que passa pela sua conta."}
      </p>
    </div>
  );
}
