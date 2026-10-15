# Fase F — Modo Empresa

**Status:** em andamento, iniciada em 15/10/2026.
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
- [ ] F1.2 Convite: tipos diferentes não entram (era só aviso; virou bloqueio pela decisão 9 — ver C8)
- [ ] F1.3 Trocar o tipo depois de criado: decidido que não troca (decisão 9 — ver C5)
- [x] F1.4 Navegação da empresa: sem Investir, sem "Pelo cartão", sem relatório de ciclo, sem "cartão que define o mês" — conferido no print de 15/10
- [ ] F1.5 Textos da empresa: Renda → Recebimentos; Início → Faturou / Gastou / Lucro
- [x] F1.6 Categorias iniciais de empresa: Materiais, Alimentação, Combustível, Manutenção de máquinas, Manutenção de veículos, Ferramentas, Impostos, Outros
- [ ] F1.7 Contas bancárias e cartões compartilhados entre os sócios (só em empresa; na família continuam privados)
- [ ] F1.8 Nome de usuário: coluna única no perfil, definido no cadastro e em Ajustes
- [ ] F1.9 Login com usuário ou e-mail (resolvido no servidor, sem expor e-mail de ninguém)

### F2 — Recebimentos
- [ ] F2.1 Recebimento parcelado: valor total ÷ parcelas, cada parcela no seu mês
- [ ] F2.2 Campo opcional "Cliente/Serviço" no recebimento e no gasto
- [ ] F2.3 Marcar parcela como recebida
- [ ] F2.4 Tela "A receber": parcelas futuras e atrasadas (não recebidas com mês já passado)
- [ ] F2.5 Início da empresa: Faturou / Gastou / Lucro; prejuízo em vermelho
- [ ] F2.6 Saldo acumulado vira "Caixa da empresa" (recebido − gasto − retiradas)

### F3 — Lucro e divisão
- [ ] F3.1 Ajustes da empresa: % de cada sócio (soma obrigatória de 100%)
- [ ] F3.2 Ajustes da empresa: % de reserva (padrão 0%)
- [ ] F3.3 Tela Lucro e divisão: mês a mês e acumulado do ano, quanto coube a cada um
- [ ] F3.4 Mês com prejuízo: mostra o prejuízo, não divide, não abate do seguinte
- [ ] F3.5 Retiradas: registrar "Talles retirou R$ X" e ver retirado × falta, por sócio

### F4 — Acerto entre sócios
- [ ] F4.1 Gasto: "Pago por" — conta da empresa ou do bolso de um sócio
- [ ] F4.2 Recebimento: "Recebido em" — conta da empresa ou conta de um sócio
- [ ] F4.3 Tela Acerto: quem deve transferir quanto a quem ("Joaquim te deve R$ 340")

### F5 — Lucro por cliente ou serviço
- [ ] F5.1 Relatório: por cliente/serviço, recebido − gasto = lucro do trabalho

### F6 — Recibos e impostos
- [ ] F6.1 Recibos da empresa visíveis aos dois sócios (hoje só quem enviou vê)
- [ ] F6.2 Exportar em zip as notas de um mês, para o contador
- [ ] F6.3 Impostos (DAS/MEI) como gasto fixo mensal na categoria Impostos

### F7 — Fechamento
- [ ] F7.1 PRD atualizado (requisitos e regras da empresa)
- [ ] F7.2 Teste completo com duas contas de empresa de teste

### F8 — Velocidade (pedido do Talles, 15/10: "quero que o app seja rápido")
Já está a favor: servidor da Vercel em São Paulo (gru1) e banco em São Paulo
(sa-east-1), sessão conferida sem ir ao servidor de login, consultas de cada
tela em paralelo.
- [ ] F8.1 Medir antes de mexer: tempo de cada tela no celular (4G) e tamanho do JavaScript por tela — sem número, não dá pra saber se melhorou
- [ ] F8.2 Banco: as regras de acesso (RLS) recalculam "quem está logado" linha por linha em 12 tabelas — trocar por `(select auth.uid())`, que calcula uma vez só
- [ ] F8.3 Banco: juntar regras de leitura duplicadas (gastos, renda, investimentos, categorias, cartões, contas) — hoje o banco testa duas ou três regras por linha
- [ ] F8.4 Banco: 3 índices que faltam (convites e cartão que define o mês)
- [ ] F8.5 Gráficos (recharts, a biblioteca mais pesada) só carregam quando a tela tem gráfico
- [ ] F8.6 Trocar de tela sem esperar: guardar o que já foi carregado (cartões, categorias, contas) em vez de buscar de novo a cada tela
- [ ] F8.7 Telas novas da empresa nascem seguindo isso (consultas em paralelo, nada de buscar a mesma coisa duas vezes)
- [ ] F8.8 Medir de novo e comparar com F8.1

---

## Correções encontradas no caminho
- [x] C1 Migração 010 não estava aplicada em produção: a seção da casa em Ajustes sumia desde 06/10 — aplicada em 15/10 (ver F0.1)
- [x] C2 Migração 011 aplicada pelo Talles no SQL Editor (o MCP do Supabase passou a cancelar mudanças de estrutura) — conferida em 15/10
- [x] C3 Migração 012 (convite diz casa ou empresa) aplicada pelo Talles — conferida em 15/10: `get_invite` devolve `household_kind`
- [ ] C4 O endereço do app mudou para rumofacil-pi.vercel.app (o antigo redireciona): conferir no Supabase (Authentication → URL Configuration) se o novo endereço está em Site URL / Redirect URLs, senão o link do e-mail de confirmação e o de trocar senha podem cair no endereço errado
- [ ] C5 Tipo fixo: Ajustes não oferece mais trocar Família/Empresa (só mostra o tipo) e o banco não deixa trocar pelo app (migração 013, testada em tabela descartável)
- [ ] C6 Cabeçalho no celular: os botões escorregavam pra esquerda quando a pessoa está sozinha (sem o seletor de escopo); Ajustes ganha engrenagem e fica um pouco maior, junto do Sair
- [ ] C7 Textos de casa aparecendo na empresa: "Sua casa, só você por enquanto", gastos, relatórios, recebimentos, categorias, cartões ("só seus" — na empresa os sócios veem), contas, recibos, Ajustes, sair da empresa, convite, exportar, excluir conta, importar planilha
- [ ] C8 Sair de uma empresa criava uma casa de família; convite deixava conta pessoal entrar em empresa — corrigido na 013 (testado com as contas da Solaris, tudo desfeito no fim)
