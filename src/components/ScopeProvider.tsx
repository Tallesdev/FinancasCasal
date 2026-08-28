"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Profile, Scope } from "@/lib/types";

type ScopeContextValue = {
  scope: Scope;
  setScope: (scope: Scope) => void;
  /** Perfil de quem está logado. */
  me: Profile;
  /** A outra pessoa da casa, se já estiver cadastrada. */
  partner: Profile | null;
  /** Os user_ids que o escopo atual cobre — use para filtrar toda consulta. */
  userIds: string[];
  /** Classe de tema que pinta a interface com a cor do escopo. */
  scopeClass: string;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

const STORAGE_KEY = "financas:scope";

export function ScopeProvider({
  me,
  partner,
  children,
}: {
  me: Profile;
  partner: Profile | null;
  children: React.ReactNode;
}) {
  const [scope, setScopeState] = useState<Scope>("me");

  // A escolha do escopo acompanha a pessoa entre as telas e entre sessões.
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "me" || saved === "us") setScopeState(saved);
  }, []);

  const setScope = useCallback((next: Scope) => {
    setScopeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<ScopeContextValue>(() => {
    const userIds =
      scope === "us" && partner ? [me.id, partner.id] : [me.id];

    const scopeClass =
      scope === "us" ? "scope-us" : me.accent === "b" ? "scope-b" : "scope-a";

    return { scope, setScope, me, partner, userIds, scopeClass };
  }, [scope, setScope, me, partner]);

  return (
    <ScopeContext.Provider value={value}>
      <div className={value.scopeClass}>{children}</div>
    </ScopeContext.Provider>
  );
}

export function useScope() {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error("useScope precisa estar dentro de ScopeProvider");
  return ctx;
}
