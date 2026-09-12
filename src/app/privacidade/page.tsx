import type { Metadata } from "next";
import { Contato, PaginaLegal, Secao } from "@/components/PaginaLegal";
import { IDADE_MINIMA, RESPONSAVEL } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade · RumoFácil" };

/*
 * RASCUNHO — escrito por IA a partir do que o app faz de verdade, conferido
 * no código e no banco em 12/09/2026. Não é peça jurídica: revisar com
 * profissional antes de divulgar amplamente.
 *
 * Regra ao editar: cada frase aqui precisa ser verdade no código. Se uma
 * feature mudar o que é coletado, esta página muda junto e TERMOS_VERSAO
 * (src/lib/legal.ts) sobe.
 */

export default function PrivacidadePage() {
  return (
    <PaginaLegal
      titulo="Política de privacidade"
      resumo="Em uma frase: guardamos o que você lança para organizar suas finanças, só você e quem está na sua casa veem, não vendemos nada, e você pode apagar tudo quando quiser."
    >
      <Secao titulo="Quem é responsável pelos seus dados">
        <p>
          O RumoFácil é operado por{" "}
          {RESPONSAVEL ? (
            <strong className="text-[var(--color-text)]">{RESPONSAVEL}</strong>
          ) : (
            <span className="text-[var(--color-out)]">(responsável ainda não identificado)</span>
          )}
          , que decide como seus dados são usados — o chamado controlador,
          nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018). Para
          qualquer assunto sobre seus dados, escreva para <Contato />.
        </p>
      </Secao>

      <Secao titulo="O que coletamos">
        <p>
          <strong className="text-[var(--color-text)]">Ao criar a conta:</strong>{" "}
          nome de exibição, e-mail e senha. A senha é guardada pelo nosso
          provedor de autenticação de forma cifrada — ninguém, nem nós,
          consegue lê-la. Pedimos sua data de nascimento só para confirmar que
          você tem {IDADE_MINIMA} anos ou mais: a conta é feita no seu
          aparelho e{" "}
          <strong className="text-[var(--color-text)]">
            a data não é enviada nem guardada
          </strong>
          . Guardamos apenas que você declarou ter a idade mínima, e quando
          aceitou estes termos.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">Enquanto você usa:</strong>{" "}
          o que você lança — gastos, renda, investimentos, categorias — e o que
          você cadastra: nomes de cartões com os dias de fechamento e
          vencimento, nomes de contas bancárias, a casa, quem está nela, a cor
          que você escolheu e os convites que você criou.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">Quando você lança por áudio:</strong>{" "}
          a gravação é enviada a um provedor de inteligência artificial que a
          transcreve e sugere os campos do gasto. O arquivo de áudio não é
          guardado pelo RumoFácil. O texto transcrito só fica salvo se você
          salvar o gasto — ele entra no campo de observação, onde você pode
          apagá-lo.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">Recibos</strong> (recurso
          em preparação): quando você anexar a foto de um recibo, a imagem
          ficará guardada para que você possa consultá-la, por exemplo na
          declaração de imposto de renda. Ver também &ldquo;Dados de saúde em
          recibos&rdquo;.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">No seu aparelho:</strong>{" "}
          duas preferências de tela — se você está vendo só os seus números ou
          os da casa, e se os valores estão ocultos. Elas ficam no seu
          navegador e não são enviadas.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">O que não coletamos:</strong>{" "}
          número de cartão, número de conta, senha de banco ou acesso ao seu
          banco. Não usamos rastreadores de publicidade nem ferramentas de
          análise de comportamento.
        </p>
      </Secao>

      <Secao titulo="Para que usamos, e com que base">
        <p>
          Usamos seus dados para <strong className="text-[var(--color-text)]">prestar o serviço</strong>{" "}
          que você pediu ao criar a conta: guardar seus lançamentos, calcular
          relatórios e mostrar os números da sua casa. Essa é a base legal de
          execução de contrato.
        </p>
        <p>
          Registros técnicos de acesso, mantidos pelos provedores de hospedagem,
          servem para manter o app funcionando e seguro.
        </p>
        <p>
          Imagens de recibos, por poderem conter dados de saúde, só serão
          guardadas com o seu consentimento específico, pedido antes do primeiro
          envio.
        </p>
      </Secao>

      <Secao titulo="Quem mais vê seus dados">
        <p>
          <strong className="text-[var(--color-text)]">As pessoas da sua casa.</strong>{" "}
          Quando você entra numa casa, quem está nela passa a ver seus
          lançamentos — gastos, renda e investimentos — e seu nome e cor.
          Cartões, contas bancárias e recibos continuam só seus, mesmo dentro
          da casa. Você pode sair da casa a qualquer momento.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">Os provedores que fazem o app funcionar</strong>,
          que tratam dados em nosso nome e só para isso: Supabase (banco de
          dados e autenticação), Vercel (hospedagem), Groq (transcrição e
          interpretação de áudio) e Cloudflare (armazenamento de recibos).
          Alguns deles processam dados{" "}
          <strong className="text-[var(--color-text)]">fora do Brasil</strong>,
          em especial nos Estados Unidos — o que a LGPD chama de transferência
          internacional. O tratamento feito por eles também segue as políticas
          de cada um.
        </p>
        <p>
          <strong className="text-[var(--color-text)]">Ninguém mais.</strong>{" "}
          Não vendemos, alugamos nem compartilhamos seus dados para publicidade.
        </p>
      </Secao>

      <Secao titulo="Dados de saúde em recibos">
        <p>
          Dado financeiro não é, pela lei, um dado sensível. Mas um recibo pode
          conter um: o comprovante de uma farmácia ou de uma clínica revela
          algo sobre sua saúde, que a LGPD protege de forma especial. Por isso
          o envio de recibos pedirá seu consentimento explícito, e você pode
          apagar qualquer recibo quando quiser.
        </p>
      </Secao>

      <Secao titulo="Por quanto tempo guardamos">
        <p>
          Enquanto sua conta existir. Quando você exclui a conta, apagamos na
          hora tudo o que é seu: perfil, lançamentos, cartões, categorias,
          contas, convites e recibos. Seus lançamentos também deixam de
          aparecer para as pessoas da casa.
        </p>
        <p>
          Cópias de segurança automáticas dos provedores podem manter dados por
          um período limitado antes de serem sobrescritas.
        </p>
      </Secao>

      <Secao titulo="Seus direitos">
        <p>
          A LGPD garante que você pode: saber se tratamos seus dados, acessá-los,
          corrigi-los, pedir que sejam apagados, levá-los para outro serviço,
          saber com quem compartilhamos e revogar um consentimento.
        </p>
        <p>
          Muita coisa você faz sozinho no app: editar nome e cor, editar ou
          apagar qualquer lançamento, sair da casa e{" "}
          <strong className="text-[var(--color-text)]">excluir a conta</strong>{" "}
          em Ajustes. Para o resto, escreva para <Contato />.
        </p>
      </Secao>

      <Secao titulo="Segurança">
        <p>
          Cada consulta ao banco é filtrada por regras que só entregam o que é
          seu ou da sua casa, aplicadas no próprio banco, não só na tela. A
          comunicação é cifrada, senhas nunca são guardadas em texto, e as
          chaves que dão acesso aos provedores ficam só no servidor. Nenhum
          sistema é à prova de tudo; se algo acontecer, veja a seção abaixo.
        </p>
      </Secao>

      <Secao titulo="Se houver um incidente">
        <p>
          Se ocorrer um incidente de segurança que possa trazer risco ou dano
          relevante a você, avisaremos você e a Autoridade Nacional de Proteção
          de Dados, como a lei exige.
        </p>
      </Secao>

      <Secao titulo="Menores de idade">
        <p>
          O RumoFácil é para pessoas com {IDADE_MINIMA} anos ou mais, e pedimos
          essa confirmação no cadastro. Um responsável pode registrar gastos da
          família na própria conta, mas menores não devem criar conta.
        </p>
      </Secao>

      <Secao titulo="Mudanças nesta política">
        <p>
          Se esta política mudar de forma importante, avisaremos no app. A data
          da versão em vigor fica no topo desta página.
        </p>
      </Secao>
    </PaginaLegal>
  );
}
