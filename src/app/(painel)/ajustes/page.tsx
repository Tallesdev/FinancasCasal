import { MeuPerfil } from "@/components/MeuPerfil";
import { MinhaCasa } from "@/components/MinhaCasa";
import { ConsentimentoRecibos } from "@/components/ConsentimentoRecibos";
import { ExportarDados } from "@/components/ExportarDados";
import { ExcluirConta } from "@/components/ExcluirConta";
import { LinkVoltar } from "@/components/ui";
import { AjustesAtalhos } from "@/components/AjustesAtalhos";
import { DivisaoLucro } from "@/components/DivisaoLucro";

export default function AjustesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        {/* No celular nenhuma aba de baixo fica marcada aqui. */}
        <div>
          <LinkVoltar href="/" rotulo="Início" soCelular />
        </div>
        <span className="scope-rule mb-3 block h-1 w-10 rounded-full" />
        <h1 className="text-2xl font-bold">Configurações</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          O que você cadastra uma vez e usa em todo lançamento.
        </p>
      </div>

      <MeuPerfil />

      <MinhaCasa />

      {/* Só aparece na empresa com 2 ou mais sócios. */}
      <DivisaoLucro />

      {/* No desktop estes já estão na coluna lateral. */}
      <AjustesAtalhos />

      <ConsentimentoRecibos />

      <ExportarDados />

      {/* Por último de propósito: irreversível não fica no caminho de nada. */}
      <ExcluirConta />
    </div>
  );
}
