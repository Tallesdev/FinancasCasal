"use client";

import { OwnerTag, Tag } from "./ui";
import { faixaDeHorario } from "@/lib/agenda";
import { APPOINTMENT_STATUS_LABEL, type Appointment } from "@/lib/types";

type Membro = { id: string; display_name: string; color: string } | undefined;

export function corDoAtendimento(a: Appointment, corDeQuemAtende?: string) {
  if (a.status === "feito") return "var(--color-in)";
  if (a.status === "cancelado") return "var(--color-text-faint)";
  return corDeQuemAtende ?? "var(--scope)";
}

export function CartaoAtendimento({
  a,
  atende,
  marcou,
  onClick,
  mostrarDia,
}: {
  a: Appointment;
  atende: Membro;
  marcou: Membro;
  onClick?: () => void;
  /** No Início: diz o dia, além do horário. */
  mostrarDia?: string;
}) {
  const horario = faixaDeHorario(a);
  const cancelado = a.status === "cancelado";
  // Sem onClick (no Início, dentro de um link) não pode ser botão: seria
  // um clicável dentro de outro.
  const Caixa = onClick ? "button" : "div";
  return (
    <Caixa
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={[
        "card flex w-full items-start gap-3 px-4 py-3 text-left",
        cancelado ? "opacity-50" : "",
      ].join(" ")}
    >
      <span
        className="mt-1 h-9 w-1 shrink-0 rounded-full"
        style={{ background: corDoAtendimento(a, atende?.color) }}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className={["truncate font-medium", cancelado ? "line-through" : ""].join(" ")}>{a.client_name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-text-faint)]">
          {mostrarDia && <span className="font-medium text-[var(--color-text-dim)]">{mostrarDia}</span>}
          <span>{horario ?? "sem horário"}</span>
          {a.status !== "marcado" && <Tag>{APPOINTMENT_STATUS_LABEL[a.status].toLowerCase()}</Tag>}
          {atende && <OwnerTag name={atende.display_name} color={atende.color} />}
          {a.services.length > 0 && (
            <span className="truncate">
              {a.services
                .slice(0, 2)
                .map((s) => s.name)
                .join(", ")}
              {a.services.length > 2 ? ` +${a.services.length - 2}` : ""}
            </span>
          )}
        </p>
        {marcou && !atende && (
          <p className="mt-0.5 text-[11px] text-[var(--color-text-faint)]">
            marcado por {marcou.display_name.split(" ")[0]}
          </p>
        )}
      </div>
    </Caixa>
  );
}

