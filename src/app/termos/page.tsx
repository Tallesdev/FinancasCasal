import type { Metadata } from "next";
import Link from "next/link";
import { Contato, PaginaLegal, Secao } from "@/components/PaginaLegal";
import { IDADE_MINIMA } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de uso · RumoFácil" };

/*
 * RASCUNHO — escrito por IA a partir do que o app faz de verdade. Não é peça
 * jurídica: revisar com profissional antes de divulgar amplamente.
 * Mudança importante aqui = subir TERMOS_VERSAO em src/lib/legal.ts.
 */

const forte = "text-[var(--color-text)]";

export default function TermosPage() {
  return (
    <PaginaLegal
      titulo="Termos de uso"
      resumo="O RumoFácil é uma ferramenta gratuita para organizar suas finanças e as da sua casa. Você é responsável pelo que lança; nós somos responsáveis por guardar isso com cuidado."
    >
      <Secao titulo="Aceite">
        <p>
          Ao criar uma conta você concorda com estes termos e com a{" "}
          <Link href="/privacidade" className="underline">
            política de privacidade
          </Link>
          . Se não concordar, não use o app.
        </p>
      </Secao>

      <Secao titulo="Quem pode usar">
        <p>
          Pessoas com <strong className={forte}>{IDADE_MINIMA} anos ou mais</strong>.
          Cada conta é de uma pessoa só, com e-mail próprio.
        </p>
      </Secao>

      <Secao titulo="O que o RumoFácil é — e o que não é">
        <p>
          É uma ferramenta de <strong className={forte}>organização</strong>:
          os números vêm do que você mesmo lança. Não se conecta ao seu banco,
          não movimenta dinheiro, não é instituição financeira e não oferece
          consultoria financeira, contábil ou tributária.
        </p>
        <p>
          Relatórios, médias e cálculos de fatura são estimativas feitas a partir
          dos seus lançamentos. Confira com o extrato e a fatura oficiais antes
          de tomar decisões ou declarar impostos.
        </p>
      </Secao>

      <Secao titulo="Sua conta">
        <p>
          Você é responsável por manter sua senha em segredo e pelo que é feito
          com a sua conta. Se desconfiar de acesso indevido, troque a senha em
          Ajustes e nos avise.
        </p>
      </Secao>

      <Secao titulo="Casa e compartilhamento">
        <p>
          Uma casa reúne até 6 pessoas. Ao aceitar um convite, você concorda que
          as pessoas da casa vejam seus lançamentos (gastos, renda e
          investimentos). Cartões, contas bancárias e recibos continuam só
          seus. Cada pessoa edita apenas o que é dela, e qualquer um pode sair
          da casa quando quiser.
        </p>
        <p>
          Convites valem por 7 dias. Compartilhe o link ou o código só com quem
          você quer na casa: não existe forma de remover outra pessoa, apenas
          de sair.
        </p>
      </Secao>

      <Secao titulo="Recursos com inteligência artificial">
        <p>
          Recursos como o lançamento por áudio usam inteligência artificial para{" "}
          <strong className={forte}>sugerir</strong> campos. A IA erra. Nada é
          salvo sem que você confira e confirme — a responsabilidade de revisar
          valor, data, cartão e categoria antes de salvar é sua.
        </p>
        <p>
          Esses recursos dependem de provedores externos e podem ficar
          indisponíveis sem aviso. Quando isso acontecer, dá para lançar
          digitando.
        </p>
      </Secao>

      <Secao titulo="Uso aceitável">
        <p>Você concorda em não:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>usar o app para qualquer atividade ilegal;</li>
          <li>
            enviar documentos ou dados de outras pessoas sem ter autorização
            para isso;
          </li>
          <li>tentar acessar dados de outras contas ou burlar a segurança;</li>
          <li>sobrecarregar o serviço de propósito ou automatizar acessos.</li>
        </ul>
      </Secao>

      <Secao titulo="Disponibilidade e custo">
        <p>
          O RumoFácil é gratuito e oferecido como está. Fazemos o possível para
          mantê-lo no ar e seus dados seguros, mas não garantimos funcionamento
          ininterrupto. Comprovantes importantes para impostos merecem uma
          cópia também fora do app.
        </p>
        <p>
          Se um dia algum recurso passar a ser pago, isso será avisado antes, e
          nada que você já guardou ficará preso atrás de pagamento.
        </p>
      </Secao>

      <Secao titulo="Encerramento e exclusão">
        <p>
          Você pode excluir sua conta a qualquer momento em Ajustes, e tudo o
          que é seu é apagado na hora. Podemos encerrar contas que violem estes
          termos.
        </p>
      </Secao>

      <Secao titulo="Mudanças nestes termos">
        <p>
          Se os termos mudarem de forma importante, avisaremos no app antes de a
          mudança valer para você.
        </p>
      </Secao>

      <Secao titulo="Lei e contato">
        <p>
          Estes termos seguem a lei brasileira, incluindo o Código de Defesa do
          Consumidor e a LGPD. Dúvidas: <Contato />.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
