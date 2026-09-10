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
  /** Todo mundo da casa, incluindo eu. Ordenado por nome. */
  members: Profile[];
  /** Todo mundo da casa menos eu. */
  others: Profile[];
  /** Os user_ids que o escopo atual cobre — use para filtrar toda consulta. */
  userIds: string[];
  /** Classe de tema para o escopo da casa (cor fixa). Vazia no individual. */
  scopeClass: string;
  /** No escopo individual, a cor da própria pessoa entra inline em --scope. */
  scopeStyle: React.CSSProperties | undefined;
};

const ScopeContext = createContext<ScopeContextValue | null>(null);

const STORAGE_KEY = "financas:scope";

export function ScopeProvider({
  me,
  members,
  children,
}: {
  me: Profile;
  members: Profile[];
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

    // A casa é uma cor fixa (não faria sentido "escolher" a cor de um grupo).
    // Individual é a cor que a pessoa escolheu — livre, então não vira
    // classe CSS: entra inline como valor de --scope.
    const scopeClass = scope === "us" ? "scope-us" : "";
    const scopeStyle =
      scope === "us"
        ? undefined
        : ({ "--scope": me.color } as React.CSSProperties);

    return {
      scope,
      setScope,
      me,
      members: ordenados,
      others,
      userIds,
      scopeClass,
      scopeStyle,
    };
  }, [saved, setScope, me, members]);

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
