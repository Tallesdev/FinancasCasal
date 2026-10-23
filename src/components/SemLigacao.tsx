import { EmptyState } from "./ui";

/**
 * Clientes e serviços moram no app de orçamentos (C28). Sem a ligação
 * configurada, as telas explicam em vez de quebrar.
 */
export function SemLigacao({ empresa }: { empresa: boolean }) {
  return (
    <EmptyState
      title={empresa ? "Ligação com os orçamentos desligada" : "Só no modo empresa"}
      description={
        empresa
          ? "Clientes e serviços são os mesmos do app de orçamentos. Falta configurar a ligação entre os dois apps (variáveis ORCAMENTOS_* na Vercel)."
          : "Clientes, serviços e agenda são do modo empresa."
      }
    />
  );
}
