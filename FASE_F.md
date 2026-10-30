# Fase F — Modo Empresa

**Status:** modo Empresa entregue e conferido (F0–F7) em 15/10/2026. Em andamento: F8 (velocidade).
**Para quem:** a Solaris — Talles e Joaquim, sócios.
**Regra desta lista:** todo problema encontrado no caminho entra como item
novo em "Correções encontradas no caminho". Nada é corrigido sem antes
virar item. Um item só é marcado quando está feito **e conferido**.

---

## Decisões (15/10/2026)

1. **Dois aplicativos em um.** Conta pessoal continua exatamente como está.
   Conta de empresa vê só as telas de empresa. Quem decide é o **tipo da
   casa** (`households.kind`, migração 010): `familia` ou `empresa`.
2. **Contas separadas.** A empresa tem contas próprias (uma por sócio),
   não as pessoais. As duas entram juntas numa casa do tipo Empresa: cada
   sócio lança na própria conta, os dois veem a empresa inteira.
   Integração com a conta pessoal fica **em aberto** (fora desta fase).
3. **Entrar com usuário OU e-mail.** Cada conta tem e-mail próprio (Gmail)
   e também um nome de usuário; o login aceita os dois.
4. **Divisão 60/40** (Talles/Joaquim), configurável, uma só para tudo.
5. **Mês com prejuízo fecha com prejuízo.** Não abate do mês seguinte e não
   é dividido; o que fazer é decidido por fora. O app mostra o prejuízo.
6. **Reserva antes de dividir:** configurável, começa em **0%**.
7. **A empresa tem conta bancária própria** (no nome do Joaquim).
8. **Sempre pelo mês.** Na empresa não existe "Pelo cartão" nem ciclo.
9. **O tipo não muda depois de criado** (decidido em 15/10, depois do primeiro
   teste). Empresa continua empresa, família continua família; convite só
   entre contas do mesmo tipo; quem sai de uma empresa vai para outra empresa.

11. **Lucro e divisão** (definido na F3, 15/10). Lucro do mês = faturado −
    gastos. Mês com lucro: sai a reserva, o resto divide pela % de cada sócio.
    Mês com prejuízo: não divide e não desconta dos outros meses. "Coube no
    ano" soma só os meses com lucro; "falta retirar" = coube − retiradas.
    Sem divisão salva, divide igual. Retirada sai do Caixa da empresa.
    Caixa e "a receber" são da empresa inteira (não mudam com o seletor).
12. **Acerto entre sócios** (definido na F4, 15/10). Gasto tem "quem
    pagou" (conta da empresa ou bolso de um sócio); recebimento tem "onde
    cai" (conta da empresa ou de um sócio). Saldo do sócio = pagou do bolso
    − recebeu na conta dele ± acertos. A tela Acerto mostra as transferências
    que zeram tudo (entre sócios e com a conta da empresa) e "Feito" registra.
    Retirada de lucro não entra no acerto (fica na tela Lucro). O Caixa passa
    a ser só a conta da empresa. Limite: "onde cai" vale pro recebimento
    inteiro — parcela que caiu em outra conta se lança separado.
13. **Lucro por cliente** (definido na F5, 15/10). Faturado do cliente no
    ano (cada parcela no seu mês) − gastos marcados com o mesmo cliente.
    Nome sem acento/maiúscula/espaço sobrando junta ("João" = "joao").
    Gasto sem cliente (combustível do mês etc.) fica fora, mostrado à parte.
14. **Recibos da empresa** (definido na F6, 15/10). Na empresa o recibo é
    da empresa: os sócios veem e baixam os de todos (só os com envio
    concluído); apagar e ligar a gasto, só quem enviou. Na família nada muda.
    "Baixar meus dados" continua só com os recibos da própria pessoa; o zip
    do mês (pro contador) leva os da empresa e um resumo.csv.
10. **Faturou × Caixa** (definido na F2, 15/10). "Faturou" é o que foi
    cobrado no mês (cada parcela no seu mês) e é dele que sai o lucro do mês.
    "Caixa da empresa" conta só o que caiu na conta, pelo dia em que caiu,
    menos tudo que saiu. Recebimento à vista nasce como "já caiu" (dá pra
    escolher "ainda não"); parcelado pergunta só da 1ª parcela; "todo mês"
    se marca mês a mês em "A receber". Qualquer sócio marca o que recebeu.

### Fora desta fase (decidido deixar em aberto)
- Retirada da empresa virar renda na conta pessoal automaticamente.
- Mover lançamentos antigos da conta pessoal para a empresa.

---

## Lista

### F0 — Base
- [x] F0.1 Aplicar a migração 010 (`households.kind`) em produção — 15/10
- [x] F0.2 Conferir no app que a seção da casa em Ajustes voltou (nome, cor, tipo) — print do Talles, 15/10

### F1 — Fundação do modo Empresa
- [x] F1.1 Cadastro: escolher "Uso pessoal" ou "Empresa"; a casa criada nasce com esse tipo — conferido 15/10: solaristalles e solaris.joaquim nasceram empresa, com as 8 categorias
- [x] F1.2 Convite: tipos diferentes não entram (era só aviso; virou bloqueio pela decisão 9 — ver C8) — conferido 15/10: Joaquim entrou na Solaris pelo link
- [x] F1.3 Trocar o tipo depois de criado: decidido que não troca (decisão 9 — ver C5)
- [x] F1.4 Navegação da empresa: sem Investir, sem "Pelo cartão", sem relatório de ciclo, sem "cartão que define o mês" — conferido no print de 15/10
- [x] F1.5 Textos da empresa: Renda → Recebimentos; Início → Faturou / Gastou / Lucro — conferido nos prints de 15/10 (Recebidos, Faturou/Gastou/Lucro)
- [x] F1.6 Categorias iniciais de empresa: Materiais, Alimentação, Combustível, Manutenção de máquinas, Manutenção de veículos, Ferramentas, Impostos, Outros
- [x] F1.7 Contas bancárias e cartões compartilhados entre os sócios (só em empresa; na família continuam privados) — conferido nos dados da Solaris em 15/10 (F7.2): cada sócio tem conta e cartão, e o Talles vê os 2 cartões e as 2 contas; família continua sem ver os de outros
- [x] F1.8 Nome de usuário: coluna única no perfil, definido no cadastro e em Ajustes — conferido nos dados da Solaris em 15/10 (F7.2): solaristalles e solaris.joaquim
- [x] F1.9 Login com usuário ou e-mail (resolvido no servidor, sem expor e-mail de ninguém) — conferido pelo Talles em 15/10 (entrou com `solaristalles`)

### F2 — Recebimentos
- [x] F2.1 Recebimento parcelado: valor total ÷ parcelas, cada parcela no seu mês — conferido 15/10 no print: Beli · Instalação 5x de R$ 300, parcela 1 recebida
- [x] F2.2 Campo opcional "Cliente/Serviço" no recebimento e no gasto — conferido nos dados da Solaris em 15/10 (F7.2): 3 gastos com cliente
- [x] F2.3 Marcar parcela como recebida — conferido 15/10
- [x] F2.4 Tela "A receber": parcelas futuras e atrasadas (não recebidas com mês já passado) — conferido 15/10 no print
- [x] F2.5 Início da empresa: Faturou / Gastou / Lucro; prejuízo em vermelho — caixa conferido pelo Talles; card A receber no ar desde o #15
- [x] F2.6 Saldo acumulado vira "Caixa da empresa" (recebido − gasto − retiradas) — conferido 15/10: "o caixa mudou no início"

### F3 — Lucro e divisão
- [x] F3.1 Ajustes da empresa: % de cada sócio (soma obrigatória de 100%) — conferido pelo Talles em 15/10
- [x] F3.2 Ajustes da empresa: % de reserva (padrão 0%) — conferido pelo Talles em 15/10
- [x] F3.3 Tela Lucro e divisão: mês a mês e acumulado do ano, quanto coube a cada um — conferido pelo Talles em 15/10
- [x] F3.4 Mês com prejuízo: mostra o prejuízo, não divide, não abate do seguinte — conferido pelo Talles em 15/10
- [x] F3.5 Retiradas: registrar "Talles retirou R$ X" e ver retirado × falta, por sócio — conferido pelo Talles em 15/10

### F4 — Acerto entre sócios
- [x] F4.1 Gasto: "Pago por" — conta da empresa ou do bolso de um sócio — conferido nos dados da Solaris em 15/10 (F7.2): 2 gastos pagos do bolso (print: "pago por Talles")
- [x] F4.2 Recebimento: "Recebido em" — conta da empresa ou conta de um sócio — conferido nos dados da Solaris em 15/10 (F7.2): 1 recebimento que caiu na conta de um sócio
- [x] F4.3 Tela Acerto: quem deve transferir quanto a quem ("Joaquim te deve R$ 340") — conferido nos dados da Solaris em 15/10 (F7.2): 2 acertos registrados pelo "Feito"

### F5 — Lucro por cliente ou serviço
- [ ] F5.1 Relatório: por cliente/serviço, recebido − gasto = lucro do trabalho — código no PR da F5 (Relatórios → "Lucro por cliente"); sem migração; conferido pelo Talles em 15/10

### F6 — Recibos e impostos
- [x] F6.1 Recibos da empresa visíveis aos dois sócios (hoje só quem enviou vê) — conferido pelo Talles em 15/10 ("tudo deu certo")
- [x] F6.2 Exportar em zip as notas de um mês, para o contador — conferido pelo Talles em 15/10
- [x] F6.3 Impostos (DAS/MEI) como gasto fixo mensal na categoria Impostos — conferido no print de 15/10 (DAS R$ 86, Impostos, fixo mensal)

### F7 — Fechamento
- [x] F7.1 PRD atualizado (requisitos e regras da empresa) — PRD v1.4, seção 4b (RF35–RF47, regras E1–E8)
- [x] F7.2 Teste completo com duas contas de empresa de teste — 15/10: as duas contas da Solaris usaram tudo (divisão 60/40 + reserva 10%, retirada, acertos, recibos dos dois, gastos do bolso, cliente); simulei no banco uma conta de família dividida: não vê cartão, conta, recibo, divisão, retirada, acerto nem gasto da Solaris. F1.9 e F5.1 conferidos pelo Talles depois

### F8 — Velocidade (pedido do Talles, 15/10: "quero que o app seja rápido")
Já está a favor: servidor da Vercel em São Paulo (gru1) e banco em São Paulo
(sa-east-1), sessão conferida sem ir ao servidor de login, consultas de cada
tela em paralelo.
- [x] F8.1 Medir antes de mexer: tempo de cada tela no celular (4G) e tamanho do JavaScript por tela — sem número, não dá pra saber se melhorou
  - 15/10, JavaScript (build): 102 kB comum a todas; cada tela do painel 178–188 kB no total (Início 183, Gastos 188, Renda 183, Configurações 188)
  - 15/10, banco: cada consulta leva 1–2 ms (conta do Talles, 137 gastos no banco todo). O banco não é o gargalo hoje; o tempo está nas idas e voltas pela rede do celular
  - Idas ao banco por tela, uma depois da outra: quase todas 1 rodada (consultas em paralelo); Início da empresa 3 rodadas
  - Medidor no app (Configurações → Velocidade): mede no celular de verdade quanto cada tela leva pra ficar pronta
  - 15/10, celular do Talles (conta do Joaquim, empresa), antes da parte 2: abrir o app 0,7 s; Início 0,4; Gastos 1,1; Recebidos 0,4; Lucro 0,4; Relatórios 0,5; Configurações 0,3
- [x] F8.2 Banco: as regras de acesso (RLS) recalculam "quem está logado" linha por linha em 12 tabelas — trocar por `(select auth.uid())`, que calcula uma vez só
- [x] F8.3 Banco: juntar regras de leitura duplicadas (gastos, renda, investimentos, categorias, cartões, contas) — hoje o banco testa duas ou três regras por linha
- [x] F8.4 Banco: 3 índices que faltam (convites e cartão que define o mês)
- [x] F8.5 Gráficos (recharts, a biblioteca mais pesada) só carregam quando a tela tem gráfico — já era assim (MonthlyBarsLazy, carregado sob demanda no Início e em Relatórios); conferido no build de 15/10: nenhuma tela leva o recharts no primeiro carregamento
- [x] F8.6 Trocar de tela sem esperar: guardar o que já foi carregado (cartões, categorias, contas) em vez de buscar de novo a cada tela
  - Cada aba de baixo guarda na memória o que carregou (lib/guardado.ts): voltar mostra na hora e confere o novo por trás. Só memória, nada gravado no aparelho; a chave leva pessoa e casa; Sair apaga
  - Depois que a tela aberta termina de carregar, o app prepara as outras abas por trás (components/PreCarregar.tsx): a tela do servidor e os dados do banco. Até a primeira visita a cada aba abre pronta
  - O que cada tela busca saiu pra lib/telas.ts (serve à tela e ao pré-carregamento)
- [x] F8.7 Telas novas da empresa nascem seguindo isso (consultas em paralelo, nada de buscar a mesma coisa duas vezes) — Início da empresa: 3 idas ao banco seguidas viraram 2; Gastos: os recibos vinham numa segunda ida, agora vêm junto; Lucro e Lucro por cliente também guardam e são pré-carregados
- [ ] F8.8 Medir de novo e comparar com F8.1
  - 15/10, simulado: o app inteiro rodando aqui com um Supabase de mentira, rede de 4G (150 ms, 4 Mbps) e processador 4x mais lento, medido pelo próprio medidor. Antes → depois:
    - Família, trocar de aba: 0,24–0,54 s → 0,04–0,23 s (Gastos 0,52 → 0,16; Renda 0,30 → 0,06; Início 0,33 → 0,12; Relatórios 0,33 → 0,09)
    - Empresa, trocar de aba: 0,30–0,94 s → 0,05–0,17 s (Início 0,83 → 0,10; Relatórios 0,94 → 0,08; Lucro 0,33 → 0,11)
    - Abrir o app de novo: família igual (~0,75 s); empresa 1,2 → 1,0 s
  - Falta: o Talles medir no celular de verdade, antes e depois

---

## Correções encontradas no caminho
- [x] C1 Migração 010 não estava aplicada em produção: a seção da casa em Ajustes sumia desde 06/10 — aplicada em 15/10 (ver F0.1)
- [x] C2 Migração 011 aplicada pelo Talles no SQL Editor (o MCP do Supabase passou a cancelar mudanças de estrutura) — conferida em 15/10
- [x] C3 Migração 012 (convite diz casa ou empresa) aplicada pelo Talles — conferida em 15/10: `get_invite` devolve `household_kind`
- [x] C4 O endereço do app mudou para rumofacil-pi.vercel.app (o antigo redireciona): conferir no Supabase (Authentication → URL Configuration) se o novo endereço está em Site URL / Redirect URLs, senão o link do e-mail de confirmação e o de trocar senha podem cair no endereço errado — feito pelo Talles em 15/10
- [x] C5 Tipo fixo: Ajustes não oferece mais trocar Família/Empresa (só mostra o tipo) e o banco não deixa trocar pelo app (migração 013, testada em tabela descartável; aplicada pelo Talles e conferida em 15/10)
- [x] C6 Cabeçalho no celular: os botões escorregavam pra esquerda quando a pessoa está sozinha (sem o seletor de escopo); Ajustes ganha engrenagem e fica um pouco maior, junto do Sair — conferido no print de 15/10
- [x] C7 Textos de casa aparecendo na empresa: "Sua casa, só você por enquanto", gastos, relatórios, recebimentos, categorias, cartões ("só seus" — na empresa os sócios veem), contas, recibos, Ajustes, sair da empresa, convite, exportar, excluir conta, importar planilha
- [x] C8 Sair de uma empresa criava uma casa de família; convite deixava conta pessoal entrar em empresa — corrigido na 013 (testado com as contas da Solaris, tudo desfeito no fim; 013 aplicada e conferida em 15/10)
- [x] C9 Na visão da empresa, o título do Início diz "Empresa"; deve mostrar o nome da empresa (o seletor do topo continua "Empresa") — pedido do Talles, 15/10
- [x] C10 Migração 014 (recebimentos) — aplicada pelo Talles e conferida no banco em 15/10 (tabela, 3 colunas, 3 políticas, regra do parcelado); teste no app ok (parcelado, Recebi, caixa)
- [x] C11 "A receber" e "Todos os recebimentos" com setinha pra recolher (pedido do Talles, 15/10)
- [x] C12 À vista marcado como recebido não voltava pra "a receber": agora dá pelo toque no status da lista e pelo "Já caiu na conta?" na edição (pedido do Talles, 15/10)
- [x] C13 Migração 015 (divisão, reserva, retiradas) — aplicada pelo Talles e conferida no banco em 15/10 (2 tabelas, reserve_pct, definir_divisao, 5 políticas); teste no app ok ("funcionou tudo", 15/10)
- [x] C14 Migração 016 (quem pagou, onde caiu, acertos) — aplicada pelo Talles e conferida no banco em 15/10 (2 colunas, 2 gatilhos, tabela, 3 políticas); teste no app ok (acertos registrados)
- [x] C15 A 016 travou TODO gasto e recebimento novo (de qualquer conta): a trava de sócio lia um campo que só existe na outra tabela ("Não deu para salvar o gasto"). Corrigida pela 017, aplicada direto em produção em 15/10 e conferida no banco. Lição: testar gatilho na tabela real (ou réplica com as MESMAS colunas), não numa réplica com só a coluna testada
- [x] C16 Migração 018 (recibos da empresa visíveis aos sócios) — aplicada e conferida no banco em 15/10 (receipts_select_empresa)
- [x] C17 Ajustes "muito escondido": o botão ⚙ Ajustes do topo abre um menu com Contas, Cartões, Categorias, Recibos, Acerto (empresa) e Configurações (pedido do Talles, 15/10)
- [x] C18 Migração 019 (F8.2–F8.4): o MCP do Supabase não aplica (pede confirmação pra apagar política e o tempo esgota; nada foi mudado). Aplicada pelo Talles no SQL Editor em 15/10 e conferida: 7 políticas novas, nenhuma antiga sobrando, 12 índices; as 9 contas veem o mesmo número de linhas em 15 tabelas (a única diferença é um recibo novo do Joaquim, enviado depois da contagem, que os dois sócios veem — e prova que enviar recibo segue funcionando)
- [x] C19 Configurações da empresa: o atalho Recibos dizia "Só você vê", mas na empresa os sócios veem (018). Texto trocado (achado ao preparar o tutorial, 15/10)
- [x] C20 Categorias e Contas no celular: nome comprido ("Manutenção de máquinas") empurrava a lista pra fora da tela e cortava o "Excluir". A lista passou a ter uma coluna que encolhe (grid-cols-1), e o nome corta com reticências (achado ao preparar o tutorial, 15/10)
- [x] C21 "Ler recibo" parou: o Groq desligou o Llama 4 Scout (17/07/2026) e o Maverick também não responde. Lista de visão agora começa pelos Qwen indicados pelo Groq; dá pra escolher o modelo na Vercel (GROQ_MODELO_VISAO, sem deploy); modelo aposentado (decommissioned) e qualquer 400 da visão passam pro próximo; o erro lista os modelos que a chave tem; resposta com <think> do Qwen é limpa antes de ler o JSON. Conferido em produção em 15/10 depois do merge: a nota de teste foi lida (Papelaria Exemplo Ltda, R$ 115, 15/10/2026, Materiais) (achado ao gravar o tutorial)
- [x] C22 A C20 fez os nomes em Categorias e Contas cortarem cedo demais no celular ("Alimenta…", "Inter em…"). Em vez de cortar, o nome agora quebra em duas linhas quando não cabe (conferido aplicando a mudança na tela de produção, 15/10)
- [x] C23 Não dava pra excluir conta (nem categoria) em uso: só aparecia "Arquivar", e arquivada não tinha Excluir. Como o banco só desfaz a ligação (on delete set null: gasto fica sem conta / "Sem categoria", cartão fica sem conta que paga), Excluir agora aparece sempre, com confirmação e um aviso explicando (reportado pelo Talles, 15/10)
- [x] C24 Formas de pagamento (pedido do Talles, 16/10): gasto ganha Dinheiro, Boleto e Cheque além de Pix e Cartão (formulário, lista, filtro, voz, importar e exportar planilha); Pix, boleto e cheque perguntam "Saiu de qual conta". Recebimento da empresa ganha "Forma de pagamento" (as mesmas cinco, opcional), que aparece na lista. Migração 020 (enum + incomes.payment_method). Feito: 020 conferida no banco (enum com cash/boleto/check, incomes.payment_method) e telas conferidas em produção (filtro e formulário de gasto com as cinco; recebimento com "Forma de pagamento").
- [x] C25 Recibo em PDF (pedido do Talles, 16/10 — o Joaquim manda comprovante em PDF): botão "Escolher PDF" ao lado de "Tirar foto" e "Escolher da galeria"; o PDF sobe como está (até 4 MB, o servidor confere que começa com %PDF-); na lista aparece um cartão "PDF" que abre o arquivo; Baixar e o zip do mês levam o .pdf. "Ler recibo" tira o texto do PDF no servidor (unpdf) e lê com o modelo de texto; PDF escaneado (sem texto) avisa pra preencher à mão. Privacidade e consentimento citam PDF. Migração 021 (aceitar application/pdf). Feito: 021 conferida no banco; em produção um comprovante PDF subiu pelo "Escolher PDF" do gasto, "Ler recibo" preencheu descrição, valor (1.234,56) e data, o cartão PDF aparece em Recibos, abrir e Baixar entregam o .pdf, e o teste foi apagado.
- [x] C26 "Ler recibo" no recebimento (pedido do Talles, 23/10): o formulário de recebimento da empresa ganha o mesmo bloco de recibo do gasto (tirar foto, galeria ou PDF) com "Ler recibo". A leitura de comprovante de quem pagou preenche o que foi, valor, data, cliente (casando com um cliente já usado) e forma de pagamento; só campo vazio, o que diverge vira aviso. O comprovante fica ligado ao recebimento (clipe na lista; em Recibos aparece como "recebimento · cliente", com o valor em verde; no zip do mês o resumo.csv ganha as colunas tipo e cliente). Migração 022 (receipts.income_id, um lançamento só por recibo, só no recebimento do próprio dono). Feito: 022 conferida no banco (coluna, trava de um lançamento, gatilho de dono, permissão); em produção um comprovante de Pix recebido em PDF subiu pelo formulário de recebimento, "Ler recibo" preencheu o que foi, valor (2.350,00), data, cliente (Padaria Exemplo Ltda, sem o CNPJ) e Pix; salvo, o recebimento ficou com clipe e o comprovante apareceu em Recibos como "recebimento · Padaria Exemplo Ltda" com +R$ 2.350,00; o teste foi apagado.
- [ ] C27 Orçamento aprovado vira recebimento (pedido do Talles, 23/10): integração com o app JJ Orçamentos (banco próprio). Em Recebimentos aparece "Orçamentos aprovados" (aprovado ou executado, ainda não lançado nem ignorado); "Lançar recebimento" abre o formulário já preenchido (orçamento + itens, cliente, valor total, condição de pagamento na observação, "ainda não caiu") e a pessoa escolhe à vista/parcelado; "Já lancei / ignorar" tira da lista. O recebimento guarda quote_id/quote_number (único por orçamento) e mostra "orç. 0040". Conferido: a lista de aprovados responde em produção (vazia hoje: nenhum aprovado pendente). Falta: o primeiro orçamento aprovado aparecer em Recebimentos e ser lançado
- [ ] C28 Clientes e serviços (pedido do Talles, 23/10): telas Clientes (busca, cadastro com CEP automático, WhatsApp) e Serviços (nome, descrição, preço sugerido; arquivar) em Ajustes da empresa. São os MESMOS cadastros do app de orçamentos: o servidor do RumoFácil lê e grava lá com a chave secreta de lá, sempre preso à empresa, e só a empresa ligada (ORCAMENTOS_HOUSEHOLD_ID) usa. Conferido: ligação ativa em produção, Clientes lista os 2 cadastrados no app de orçamentos (Belizario, Condomínio Residencial Cidade Jardim) e Serviços lista o catálogo; a agenda escolheu cliente e serviço daí. Falta: o primeiro cadastro/edição de verdade feito por vocês aparecer no app de orçamentos (não gravei teste no cadastro real)
- [x] C29 Agenda (pedido do Talles, 23/10): aba Agenda na barra (depois do Início) com o mês em grade (pontinhos no celular, nomes no computador); tocar no dia lista os clientes; "Marcar cliente" escolhe o cliente do cadastro (ou digita um novo e salva no cadastro), dia, horário opcional, serviços combinados (do catálogo ou digitados), detalhes do serviço (o geral, não item por item) e quem vai atender. Tocar no atendimento mostra tudo, com Ligar, WhatsApp e Mapa, e marca feito/cancelado. Início da empresa ganha "Agenda: hoje e próximos 7 dias". Os dois sócios veem e editam (RLS da 023). Feito: 023 conferida no banco (colunas, índice único, quote_dismissals, appointments, políticas e gatilhos); em produção, na Solaris, marquei Belizario (do cadastro dos orçamentos, com telefone) às 09:30–11:00 com um serviço do catálogo e um digitado, detalhes e Talles atendendo: apareceu no dia certo da grade, no cartão do dia e no Início ("1 cliente hoje"); o detalhe mostrou Ligar/WhatsApp, serviços, detalhes e quem marcou; "Marcar como feito" funcionou e o teste foi apagado (0 atendimentos no banco).
- [x] C30 Importar extrato (pedido do Talles, 20/11 — esquece de lançar gastos): tela "Importar extrato" só no modo pessoal (Ajustes e botão em Gastos). Lê a fatura do cartão Nubank em CSV, o extrato da conta Nubank em CSV e OFX de qualquer banco; entradas, estornos e pagamento de fatura ficam de fora. Cada linha ganha uma marca (FITID ou data+nome+valor+ordem) e o mesmo extrato nunca entra duas vezes. Cruzamento com o que foi lançado à mão: valor exato e data a até 4 dias (parcela e fixo: o mesmo mês e a mesma parcela) — o nome só desempata, porque "esquinão" vira "Conveniencia" no extrato; o que bate vai pra "Parecem já lançados" (desmarcado, mostrando o lançamento) e o resto pra "Novos" (marcado). O nome e a categoria que a pessoa dá a um nome do extrato ficam aprendidos (statement_aliases). Importação desfazível (imports). Migração 024 (expenses.extrato_ref único por pessoa + statement_aliases). Feito: 024 conferida no banco; em produção, com uma conta pessoal temporária e a fatura real do Talles (22 compras), 6 foram pra "Parecem já lançados" (esquinão, mercado, óculos 4/4, Puma 2/2 com 1 centavo de diferença, Olympikus 7/10 lançado como 8/10, TikTok lançado inteiro), 16 lançadas no cartão Nubank, o nome aprendido ("Conveniencia" → "Esquinão" com categoria) voltou sozinho, a mesma fatura de novo deu 0 novos e o Desfazer funcionou. Na empresa a tela fica escondida (botão, menu e /extrato). Conta temporária excluída pelo app (0 restos no banco).
- [x] C31 Importar extrato lançava a fatura como Pix (achado no teste em produção com conta temporária): arquivo escolhido antes de a tela terminar de carregar os cartões caía em "Conta" e os 19 gastos entraram como Pix sem cartão. Agora o botão de escolher arquivo espera carregar, e fatura de cartão fica sempre em "Cartão" (sem cartão cadastrado, a tela pede pra cadastrar em vez de lançar como Pix). Feito: em produção o arquivo só pode ser escolhido depois de carregar, e os 16 gastos entraram no cartão Nubank.
- [x] C32 Importar extrato deixava parcela já lançada como nova (Talles, com a fatura real: Blusas Puma lançadas 2x de 121,50 e a fatura com 121,49; Tênis Olympikus 7/10). Parcela agora casa com até R$ 0,10 (ou 2%) de diferença, número da parcela com 1 de folga e o mesmo total de vezes; e casa também com a compra lançada inteira (parcela × vezes ≈ total, comprada antes). Fora de parcela, o valor continua exato. Feito: em produção, Puma (121,50 x 121,49), Olympikus (8/10 x 7/10) e TikTok lançado inteiro (52,50 = 2 × 26,25) vieram em "Parecem já lançados", desmarcados.
- [x] C33 Lucro por cliente contava nomes que não são clientes (Talles, 24/10: "Hot batata", o restaurante do almoço, aparecia como cliente). Causa: o gasto "Almoço Talles" tinha "Hot batata" escrito no campo Cliente, e o relatório virava cliente qualquer nome escrito num gasto; no mesmo campo havia clientes escritos de outro jeito ("Cidade jardim", "Sup lima alterosa", "Para Eduardo (Belizário)"), que ficavam separados do cliente de verdade. Agora só é cliente quem tem recebimento ou está no cadastro; o resto vai pra uma caixa "Nomes nos gastos que não são clientes", com "É <cliente parecido>" e "Não é cliente (tirar)" pra corrigir com um toque (só os gastos de quem está logado; os do sócio, ele corrige). No formulário de gasto, o campo Cliente virou lista (Nenhum, os clientes de verdade, Outro cliente…) em vez de sugerir nomes de gastos antigos. Feito: em produção (só olhando, sem mexer nos dados), o relatório da Solaris mostra só Supermercado Irmãos Lima Alterosa, Belizário, Condomínio Cidade Jardim e Rodrigo Nogueira; "Hot batata", "Cidade jardim", "Sup lima alterosa" e "Para Eduardo (Belizário)" foram pra caixa nova, com "É Belizário" e "É Supermercado Irmãos Lima Alterosa"; o campo Cliente do gasto abre em "Nenhum (gasto geral)" com os clientes de verdade.
- [x] C34 Nome solto sem sugestão quando dois clientes empatam (achado na conferência da C33): "Cidade jardim" parece tanto "Condomínio Cidade Jardim" (recebimento) quanto "Condomínio Residencial Cidade Jardim" (cadastro), e o app não sugeria nenhum. Agora mostra um botão "É …" pra cada um (até 3). No campo Cliente do gasto, quando o mesmo cliente está escrito diferente no recebimento e no cadastro ("Belizário" x "Belizario"), vale o nome do recebimento, que é o do relatório. Feito: em produção (só olhando), "Cidade jardim" mostra "É Condomínio Cidade Jardim" e "É Condomínio Residencial Cidade Jardim", e o campo Cliente do gasto lista "Belizário" com acento.
- [ ] C35 Nome solto que é cliente novo (Talles, 24/10: "Para Eduardo (Belizário)" é o Eduardo, que veio pelo Belizário mas paga ele mesmo). Na caixa "Nomes nos gastos que não são clientes", botão "É um cliente novo": abre o nome pra ajustar (ex.: "Eduardo (Belizário)") e cadastra no cadastro de clientes (o mesmo do app de orçamentos); se o nome mudou, os gastos de quem está logado passam a usar o nome novo. Só aparece na empresa ligada aos orçamentos. Testado em servidor local com uma conta de empresa temporária (cadastro dos orçamentos simulado): o POST foi com o nome ajustado, o gasto passou a "Eduardo (Belizário)", o Eduardo entrou na lista de clientes e o nome saiu da caixa; conta excluída, 0 restos no banco. Falta: conferir em produção no primeiro uso.
- [ ] C36 Parcelado no cartão sem dizer em que faturas cai (Talles, 27/10: óculos 4x no Nubank comprado em 11/08 "terminando em novembro" — achou que o app não olhava o fechamento). Conferido: o app já casa com o banco — fechamento dia 13, vencimento 21: 1ª parcela na fatura que vence 21/08, última (4/4) na que vence 21/11, e a fatura real do Nubank que vence em 20/11 traz "Ginato Optica - Parcela 4/4". Nenhum dado mexido. O que faltava era a prévia dizer isso: no parcelado com cartão que tem fechamento, aparece "No Nubank (fecha dia 13): 1ª parcela na fatura que vence 21/08/2026, última na que vence 21/11/2026" (compra depois do fechamento já começa na fatura seguinte). Vale no pessoal e na empresa (o formulário é o mesmo).
- [ ] C37 Importar extrato em PDF (Talles, 27/10: alguns bancos só mandam a fatura em PDF). A tela aceita PDF além de CSV e OFX: o servidor (/api/extrato/pdf) tira o texto do PDF (só as linhas com valor, data ou vencimento — até 30 páginas), a IA da Groq devolve as linhas (data, nome, valor; positivo saiu, negativo entrou; ano das compras "13 OUT" tirado do vencimento) e o resto é o mesmo caminho do CSV: cruza com o que já está lançado, a pessoa confere e importa. A marca da linha do PDF é data + valor (+ ordem), porque a IA pode escrever o nome diferente a cada leitura; mandar o mesmo PDF de novo não repete. PDF com senha ou escaneado dá aviso pra mandar CSV/OFX. Nada é salvo na leitura e o PDF não fica guardado. Privacidade cita a Groq também pra extratos em PDF. Testado: texto de uma fatura de exemplo sai certo e as linhas viram gasto/entrada com parcela. Falta: testar em produção (a chave da Groq só existe lá).
- [ ] C38 Adiantar parcelas (Talles, 28/10, pessoal e empresa). Em Gastos, todo parcelado do próprio usuário ganha o botão "Adiantar": abre um pop-up com as parcelas a vencer pra marcar (atalhos "a última", "as 2/3 últimas", "todas"), a data do pagamento (padrão hoje) e o valor pago (opcional, pra quando o banco dá desconto; é dividido entre as parcelas). As parcelas adiantadas saem do mês delas e entram no gasto do dia do adiantamento, com o rótulo "parcela 9 de 10 · adiantada"; o pop-up diz quantas faltam depois e quando é a última, e lista as já adiantadas com "Desfazer". Migração 025: tabela installment_advances (RLS: a casa vê, só o dono mexe; trigger confere dono, parcelado e número da parcela) e as três funções que abrem o parcelado (expense_occurrences, expenses_in_window, cycle_expense_detail) passam a usar os adiantamentos, com a coluna nova `advanced`. Resumo do mês, ranking, fatura, Início, lucro e acerto entre sócios acompanham sozinhos. Conferido no banco real (só leitura): sem adiantamento, as funções novas devolvem exatamente o mesmo das antigas (508 ocorrências por mês e 261 por dia, 0 diferenças); simulando as parcelas 3 e 4 do óculos adiantadas em 05/09 por R$ 190,00, as duas saem de out/nov e entram em setembro. Falta: rodar a 025 e testar em produção.
