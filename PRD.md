# PRD: Finanças do casal

**Versão:** v1.1
**Status:** Aprovado
**Autor:** Talles
**Última atualização:** 03/09/2026
**Escopo desta versão:** MVP utilizável pelos dois no dia a dia

---

## TL;DR

PWA de controle financeiro para um casal que mistura a vida mas não a conta
bancária. Cada um lança a própria renda, os próprios gastos e os próprios
aportes, e tem o próprio relatório. Uma segunda visão soma os dois e mostra o
retrato da casa. Duas pessoas usam, sem hierarquia entre elas.

---

## 1. O Problema

### Descrição

O casal decide junto (aluguel, mercado, viagem, quanto dá pra investir) mas
gasta separado — cada um com o próprio salário, os próprios cartões, o próprio
Pix. Hoje não existe um lugar onde essas duas realidades coexistam.

As duas alternativas disponíveis falham em pontas opostas:

- **Planilha compartilhada** — dá o total da casa, mas cobra manutenção manual
  toda vez que um parcelado nasce ou morre, e não abre no celular na fila do
  mercado. Na prática, o preenchimento atrasa e depois ninguém volta.
- **App de finanças pessoal** (Mobills, Organizze e afins) — resolve muito bem
  a visão individual, mas o modelo mental é de uma pessoa só. Compartilhar
  significa juntar tudo numa conta só e perder a separação, ou manter duas
  contas e nunca ver o total.

O que falta é a possibilidade de alternar entre as duas leituras sem duplicar
lançamento.

### Evidências

Este é um produto de uso próprio, então não há dados de mercado. As evidências
são de primeira mão:

- **Qualitativo** — o casal já tentou planilha e abandonou. O ponto de quebra é
  o gasto recorrente: manter parcelas e assinaturas em dia numa planilha exige
  editar várias linhas por mês, e é aí que o hábito morre.
- **Qualitativo** — a pergunta que ninguém consegue responder hoje é "o que mais
  puxou nosso dinheiro esse mês". Ela exige olhar duas faturas, dois extratos
  Pix e somar de cabeça.
- **[ASSUMIDO]** — a barreira principal não é falta de disciplina, é atrito de
  registro. Se lançar um gasto levar menos de 15 segundos no celular, o hábito
  se sustenta. Esta premissa dirige boa parte das decisões de interface abaixo e
  pode se provar errada.

### Por que agora

Uma fonte de renda secundária termina até o fim do ano. A margem vai apertar, e
decidir onde cortar exige enxergar onde o dinheiro está indo — hoje isso é
palpite.

---

## 2. Personas & Usuários

Duas pessoas. Não há usuário terceiro, admin ou convidado, nem previsão de
haver.

### Talles — desenvolvedor

- **Quem é:** dev backend, renda variável de freelas, confortável com
  ferramentas técnicas.
- **Job to be done:** entender quanto sobra de verdade depois dos fixos, e
  quanto dá pra investir sem apertar o mês.
- **Dor atual:** renda irregular torna a média mensal mais informativa que o mês
  isolado, e nenhuma ferramenta dele mostra isso.
- **Como usa:** sessões mais longas, no computador, olhando relatório e
  tendência. Lança gastos em lote, não um a um.
- **Particularidade `[DEFINIDO]`:** o cartão fecha num dia fixo do mês (ex:
  dia 13), então uma compra feita depois do fechamento só vira fatura no mês
  seguinte. Cruzado com renda variável, o mês calendário sozinho não responde
  "quanto vou ter que pagar" — só "quanto ganhei e gastei no mês". As duas
  perguntas são válidas e ficam em relatórios diferentes (ver RF25–RF28).

### A namorada

- **Quem é:** renda de salário, previsível.
- **Job to be done:** registrar gastos sem que isso vire tarefa, e saber se o
  mês está dentro do normal.
- **Dor atual:** ferramenta de dev não serve — se exigir explicação pra usar,
  ela não usa.
- **Como usa:** celular, sessões curtas, quase sempre logo depois de gastar.

**Implicação de design:** os dois perfis de uso são diferentes o bastante pra
que a interface precise servir aos dois sem escolher um. Lançar precisa ser
rápido no celular; analisar precisa ser denso no desktop. É a mesma tela em
tamanhos diferentes, não dois produtos.

---

## 3. Solução Proposta

### Descrição

Um app onde todo lançamento pertence a uma pessoa, e um controle no topo alterna
entre **"só o meu"** e **"nós dois"**. Todas as telas de leitura respondem a esse
controle. Nenhum dado é duplicado — a visão do casal é a mesma base, somada.

O segundo pilar é o **gasto recorrente registrado uma vez**. Um parcelado em 10x
é um lançamento, não dez. O app sabe em que meses ele cai, mostra "parcela 3 de
10" e para de mostrar sozinho quando acaba. É a resposta direta ao motivo pelo
qual a planilha foi abandonada.

### User stories

```
Como pessoa do casal, quero lançar um gasto do Pix em poucos toques logo
depois de pagar, para que eu não deixe pra depois e esqueça.

Como pessoa do casal, quero cadastrar uma compra parcelada uma vez só,
para que ela apareça sozinha nos meses certos e suma quando terminar.

Como pessoa do casal, quero alternar entre a minha visão e a nossa,
para que eu veja tanto o meu comportamento quanto o retrato da casa.

Como pessoa do casal, quero ver qual categoria mais consumiu no período,
para que a conversa sobre corte de gasto tenha um número no meio.

Como pessoa do casal, quero saber minha média de entrada e saída,
para que meses atípicos não distorçam minha leitura.

Como pessoa do casal, quero registrar quanto invisto por mês,
para que investimento apareça como destino do dinheiro e não como sobra.
```

### Abordagem `[DEFINIDO]`

PWA instalável, Next.js + Supabase. Sem app de loja, sem backend próprio, sem
integração bancária. Lançamento é manual e assumido como tal.

---

## 4. Requisitos Funcionais

### P0 — Sem isso o app não serve

**Acesso**
- **RF01** — Duas contas fixas, login por e-mail e senha. Cadastro público
  desligado. Sessão persiste entre aberturas do app.
- **RF02** — As duas contas têm exatamente os mesmos poderes. Não há papéis.

**Escopo**
- **RF03** — Um controle presente no topo de toda tela alterna entre visão
  individual e visão do casal. A escolha persiste entre telas e sessões.
- **RF04** — A visão ativa fica visualmente óbvia sem precisar ler o controle:
  a cor de destaque da interface muda conforme o escopo.
- **RF05** — Cada pessoa só edita ou apaga os próprios lançamentos. Na visão do
  casal os lançamentos da outra pessoa aparecem, mas em modo leitura.

**Lançamentos**
- **RF06** — Registrar renda: fonte, valor, se é avulsa ou recorrente, quando
  começa, quando termina (opcional). Mais de uma fonte por pessoa.
- **RF07** — Registrar gasto: descrição, valor, forma de pagamento (cartão ou
  Pix), tipo (variável, fixo mensal ou parcelado), categoria, data.
- **RF08** — Gasto de cartão exige cartão. Gasto no Pix não.
- **RF09** — Tanto cartão quanto Pix aceitam os três tipos. Assinatura debitada
  no Pix é tão fixa quanto no cartão.
- **RF10** — Gasto parcelado pede o número de parcelas e o valor **da parcela**.
  O app calcula o mês final e mostra antes de salvar.
- **RF11** — Gasto fixo mensal aceita fim indefinido.
- **RF12** — Registrar investimento: nome, tipo de ativo, valor, aporte único ou
  mensal, período.
- **RF13** — Cadastrar cartões, com nome, fechamento e vencimento. Cada um vê só
  os próprios.
- **RF14** — Criar e editar categorias livremente. Cada um mantém a própria
  lista.

**Leitura**
- **RF15** — Dashboard do mês corrente: quanto entrou, quanto saiu, quanto foi
  investido, e o que sobrou.
- **RF16** — Gráfico dos últimos meses comparando entrada e saída.
- **RF17** — Relatório anual: os 12 meses, com entrada, saída e investimento.
- **RF18** — Média de entrada e média de saída no período selecionado.
- **RF19** — Tabela de categorias ordenada por quanto consumiu, com o valor e a
  participação no total.
- **RF20** — Lista de gastos filtrável por mês, forma de pagamento, tipo e
  categoria.

### P1 — Melhora bastante, mas não bloqueia

- **RF21** — Lançamento parcelado mostra "parcela 3 de 10" na lista do mês.
- **RF22** — Dashboard lista os fixos que caem no mês, para conferência rápida.
- **RF23** — Instalável na tela de início, abrindo em tela cheia.
- **RF24** — Categoria pode ser criada de dentro do formulário de gasto, sem
  perder o que já foi preenchido.

**Ciclo de fatura** `[DEFINIDO em 27/08/2026]` — resolve o descolamento entre
mês calendário e fatura, descrito na particularidade da persona Talles. É um
relatório adicional; o mensal continua existindo do jeito que está.

- **RF25** — Cadastrar contas bancárias (ex: "Nubank"). Cada cartão pertence a
  uma conta, e cada gasto pode ser marcado com a conta de onde o dinheiro saiu.
  Serve para separar a origem do gasto na lista, para quem usa mais de uma
  conta. `[REVISADO em 03/09/2026 — ver histórico]`
- **RF26** — Relatório por ciclo: escolhe um cartão, o app calcula a janela do
  ciclo a partir do dia de fechamento dele (ex: 14/08 a 13/09) e mostra as
  compras **daquele cartão** que caíram na janela.
- **RF27** — O relatório de ciclo mostra a fatura fechada, a renda que entrou
  na mesma janela, a sobra depois da fatura, e o ranking de categoria da
  janela.
- **RF28** — Contas bancárias são privadas (só o dono vê e edita), mesma regra
  dos cartões.
- **RF31** — A pessoa escolhe um cartão para **definir o próprio mês**. Quem
  faz isso passa a ver, na primeira tela, quanto a fatura já acumulou, quando
  ela fecha e quando é paga. Quem não escolhe nenhum continua no mês do
  calendário, sem diferença nenhuma.

### P2 — Depois

- **RF29** — Duplicar um gasto recente como atalho de lançamento.
- **RF30** — Funcionar offline para leitura do mês já carregado.

### Regras de negócio

1. **Valor é sempre de uma ocorrência.** Num parcelado, `amount` é a parcela,
   nunca o total. A soma do período é o app que faz.
2. **Recorrente é um registro.** Um fixo de 24 meses é uma linha. Editar o valor
   altera todas as ocorrências futuras; não há histórico de valor por mês nesta
   versão.
3. **Fim indefinido projeta até o fim do período consultado.** Um fixo sem data
   final aparece em todos os meses do relatório aberto.
4. **Ranking agrupa por nome de categoria.** Como cada um tem a própria lista,
   "Mercado" das duas contas soma na visão do casal. Nomes diferentes viram
   linhas diferentes — é comportamento esperado, não bug.
5. **Investimento é saída, não sobra.** No cálculo do saldo ele aparece como
   destino do dinheiro, na mesma altura dos gastos. Isso é deliberado: tratar
   aporte como sobra faz o casal investir só o que resta, que é o oposto do
   objetivo.
6. **Cartão é privado até na leitura.** Na visão do casal o gasto da outra
   pessoa aparece como "Cartão", sem nomear qual.
7. **O relatório de ciclo só tem gasto de cartão.** Pix e transferência saem
   da conta no dia em que acontecem — não esperam fechamento nenhum, então não
   pertencem a uma fatura. Eles ficam no relatório mensal. A conta bancária
   marcada num gasto serve para separar origem na lista, não para puxá-lo para
   dentro de um ciclo.
8. **O ciclo é sempre de um cartão específico**, não de uma conta em abstrato.
   Se uma conta tiver dois cartões com fechamentos diferentes, são dois
   ciclos diferentes — não existe "ciclo da conta" combinando os dois.
9. **A fatura é dívida no momento em que fecha, não quando é paga.** Fechou dia
   13, aquele dinheiro já está comprometido, mesmo que só saia da conta dia 21.
   O vencimento é informação de tela e não entra em cálculo nenhum. A
   consequência é que "sobra depois da fatura" é competência, não saldo em
   conta — os gastos fora do cartão não estão descontados dela.
10. **Renda semanal é lançamento avulso, não previsão.** Quem recebe por
   semana lança o que recebeu, no fim de semana em que recebeu. Não existe
   projeção de renda futura no app — um fim de semana sem trabalho é
   simplesmente um lançamento que não aconteceu.

### Estados que precisam existir

Estas telas vão passar mais tempo vazias do que cheias no começo. Vazio não é
erro, é convite.

| Situação | Comportamento |
| --- | --- |
| Nenhum gasto no mês | "Nada lançado em Agosto ainda" + botão de lançar |
| Nenhum cartão | Formulário de gasto desabilita "Cartão" e aponta pra `/cartoes` |
| Visão do casal sem a outra pessoa ter lançado nada | Mostra os números de quem lançou, sem tratar como erro |
| Falha ao salvar | Diz o que aconteceu e mantém o formulário preenchido. Nunca perde o que foi digitado. |
| Carregando | Esqueleto no lugar do número, não spinner de tela cheia |

---

## 5. Requisitos Não-Funcionais

- **Mobile-first** — a tela pequena é o caso principal, não a adaptação. Ações
  de navegação ficam ao alcance do polegar.
- **Telas pequenas de verdade** `[DEFINIDO em 27/08/2026]` — testado contra
  390px de largura (iPhone 13, o da Duda) e 375px (iPhone SE), não só contra
  o notebook de quem programa. Nenhum campo de formulário pode disparar o
  zoom automático do iOS Safari (que acontece quando a fonte do campo é
  menor que 16px) — isso já causou um bug real de usabilidade no formulário
  de Renda.
- **Velocidade de lançamento** — do toque no botão até o gasto salvo, o caminho
  mais curto possível. Se um campo dá pra inferir, ele já vem preenchido.
- **Legibilidade de número** — todo valor monetário usa fonte mono com dígitos
  de largura fixa, para colunas alinharem na vertical em qualquer tabela.
- **Acessibilidade** — foco visível no teclado, contraste suficiente, `prefers-reduced-motion`
  respeitado. Cor nunca é o único sinal: o escopo ativo também é dito em texto.
- **Segurança** — cadastro público desligado. Isolamento de dados garantido no
  banco, não só na interface. Nenhuma chave secreta no cliente.
- **Idioma** — português do Brasil, real em BRL, datas em dd/mm/aaaa.

---

## 6. Fora de Escopo

Coisas que vão dar vontade de pedir, e o motivo de ficarem de fora agora:

- **Integração com banco / Open Finance** — exige homologação e custo. Lançamento
  manual é aceito como premissa.
- **Importar OFX ou CSV de fatura** — bom candidato pra depois, mas não é o que
  destrava o uso diário.
- **Quem contribuiu quanto (% por pessoa)** — decisão explícita: a v1 mostra só
  os totais somados. Entra depois se a conversa pedir.
- **Divisão de conta e acerto entre os dois** — o app registra, não faz
  contabilidade entre as partes.
- **Metas e orçamento por categoria** — depende de ter histórico. Sem 3 meses de
  dado, meta é chute.
- **Terceira pessoa, convite, papéis** — o produto assume duas pessoas na
  estrutura. Ampliar exigiria repensar o modelo.
- **Rendimento e cotação de investimento** — registra aporte, não acompanha
  carteira. Isso é outro produto.
- **Notificação de vencimento** — precisa de push e serviço de agendamento.
- **Modo claro** — o app nasce escuro.

---

## 7. Como saber se funcionou

Sem métrica de produto, então o critério é comportamental. O app funciona se
sobreviver ao terceiro mês.

| Sinal | O que significa |
| --- | --- |
| Os dois lançando por 3 meses seguidos | Passou do entusiasmo inicial |
| Ela lançando sem perguntar como faz | A interface se explica sozinha |
| A pergunta "o que puxou mais esse mês" respondida em segundos | O relatório entrega o que motivou o projeto |
| Um parcelado sumindo sozinho no mês certo | O modelo de recorrência funcionou |
| A conversa sobre dinheiro citando um número do app | O objetivo real |

**Sinal de fracasso, se aparecer:** um dos dois lançando gasto em lote no fim do
mês, de memória. Significa que o atrito de registro venceu, e o problema passa a
ser velocidade do formulário, não falta de disciplina.

---

## 8. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
| --- | --- | --- | --- |
| O hábito de lançar não pega e o app esvazia | Alta | Alto | Lançar tem que ser a ação mais rápida do app. Se der pra tirar um campo, tira. |
| Categorias com nomes diferentes nas duas listas fragmentam o ranking do casal | Média | Médio | O seed cria a mesma lista inicial nas duas contas. Se virar problema, unificar depois. |
| A separação individual/casal ser esquecida em alguma tela | Média | Alto | O filtro por escopo vem de um único lugar. Nenhuma consulta monta esse filtro sozinha. |
| Fixo com valor variável (conta de luz) não caber no modelo | Média | Médio | Por ora, lança como variável. Se incomodar, avaliar valor por ocorrência. |
| Interface pensada por dev não servir pra ela | Média | Alto | Ela testa cada tela antes de seguir pra próxima. |

---

## 9. Entrega

Sem prazo externo. A ordem importa mais que a data, porque cada fase depende da
anterior.

| Fase | Entrega | Pronto quando |
| --- | --- | --- |
| 1 | Fundação — banco, login, escopo, casca do app | Os dois logam e o alternador mostra os dois nomes |
| 2 | Cartões e categorias | Dá pra cadastrar o que o formulário de gasto precisa |
| 3 | Gastos | Um parcelado lançado aparece nos meses certos com o número da parcela |
| 4 | Renda e investimentos | O saldo do mês fecha com a realidade |
| 5 | Dashboard e relatórios | A pergunta "o que puxou mais" tem resposta |
| 6 | Uso real | Um mês inteiro usado pelos dois, sem planilha paralela |

**Fase 1 concluída em 27/08/2026.**

---

## 10. Perguntas em aberto

| Pergunta | Quando resolver |
| --- | --- |
| Fixo de valor variável (luz, água) merece tratamento próprio? | Depois de 2 meses de uso |
| A média deve considerar 6 ou 12 meses? | Quando houver histórico pra comparar |
| Vale unificar a lista de categorias entre os dois? | Se o ranking do casal fragmentar na prática |
| A matemática do ciclo bate com a fatura real do Nubank? | **Parcial:** conferida contra a regra descrita (fecha 13, compra do 14 em diante vai pra fatura seguinte, paga 21) e contra mês curto (fecha 31 → 28/02). Falta comparar com uma fatura de verdade. |
| Fechamento/vencimento em dia > 28 é aproximado (cai pro último dia do mês em fevereiro). Isso incomoda na prática? | Depois de observar um ciclo em mês curto |

**Resolvida em 27/08/2026:** gasto no cartão cai no mês da compra pro
relatório mensal (isso não muda — é o que responde "quanto ganhei/gastei no
mês"). A pergunta "quanto vou pagar de fato" tem resposta própria agora: o
relatório de ciclo (RF25–RF28), que segue o fechamento do cartão em vez do
calendário.

---

## Histórico de versões

| Versão | Data | O que mudou |
| --- | --- | --- |
| v1.0 | 27/08/2026 | Versão inicial, escrita depois da Fase 1 |
| v1.1 | 03/09/2026 | Ciclo de fatura passa a ser só gasto de cartão (regra 7 reescrita); fatura vira dívida no fechamento (regra 9); renda semanal é lançamento avulso (regra 10); RF31, o cartão que define o mês. Contas bancárias sobrevivem com outro propósito: separar origem do gasto, já que a Duda usa duas. |
