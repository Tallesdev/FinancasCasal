"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Household, Profile, Scope } from "@/lib/types";

type ScopeContextValue = {
  scope: Scope;
  setScope: (scope: Scope) => void;
  /** Perfil de quem está logado. */
  me: Profile;
  /** Todo mundo da casa, incluindo eu. Ordenado por nome. */
  members: Profile[];
  /** Todo mundo da casa menos eu. */
  others: Profile[];
  /** A casa. Nulo só se a leitura falhar — o gatilho garante que existe. */
  household: Household | null;
  /** Os user_ids que o escopo atual cobre — use para filtrar toda consulta. */
  userIds: string[];
  /** Fallback de tema quando a cor ainda não carregou. */
  scopeClass: string;
  /** A cor do escopo ativo entra inline em --scope: a da pessoa ou a da casa. */
  scopeStyle: React.CSSProperties | undefined;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

const STORAGE_KEY = "financas:scope";

export function ScopeProvider({
  me,
  members,
  household,
  children,
}: {
  me: Profile;
  members: Profile[];
  household: Household | null;
  children: React.ReactNode;
}) {
  const [saved, setSaved] = useState<Scope>("me");

  // A escolha do escopo acompanha a pessoa entre as telas e entre sessões.
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "me" || stored === "us") setSaved(stored);
  }, []);

  const setScope = useCallback((next: Scope) => {
    setSaved(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<ScopeContextValue>(() => {
    const ordenados = [...members].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "pt-BR")
    );
    const others = ordenados.filter((m) => m.id !== me.id);

    // Sozinho na casa não existe "todos": o escopo é sempre "eu", mesmo que
    // a escolha salva diga outra coisa (ela pode ter vindo de outra casa).
    const scope: Scope = ordenados.length < 2 ? "me" : saved;

    const userIds = scope === "us" ? ordenados.map((m) => m.id) : [me.id];

    // Nenhuma das duas cores é fixa: a pessoa escolhe a dela, a casa a
    // dela. Como são livres, não viram classe CSS — entram inline em
    // --scope. A classe fica só de rede se a casa ainda não carregou.
    const cor = scope === "us" ? household?.color : me.color;
    const scopeClass = scope === "us" && !household ? "scope-us" : "";
    const scopeStyle = cor
      ? ({ "--scope": cor } as React.CSSProperties)
      : undefined;

    return {
      scope,
      setScope,
      me,
      members: ordenados,
      others,
      household,
      userIds,
      scopeClass,
      scopeStyle,
    };
  }, [saved, setScope, me, members, household]);

  return (
    <ScopeContext.Provider value={value}>
      <div className={value.scopeClass} style={value.scopeStyle}>
        {children}
      </div>
    </ScopeContext.Provider>
  );
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope precisa estar dentro de ScopeProvider");
  return ctx;
}
