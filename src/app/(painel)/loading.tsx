import { Loading } from "@/components/ui";

/* Resposta imediata ao trocar de aba: sem isto, a tela antiga ficava parada
   até a nova chegar do servidor, e o toque parecia não ter pegado. */
export default function CarregandoPainel() {
  return <Loading />;
}
