# Importar planilha

**Status:** Implementado em 12/09/2026. Depende da migração 008 (tabela
`imports` e coluna `import_id`).
**Onde:** `/importar` (menu lateral no desktop, Ajustes no celular).
**Código:** `src/app/(painel)/importar/page.tsx` (tela) e `src/lib/planilha.ts`
(leitura, sem React — testável com `node --experimental-strip-types`).

---

## A regra

A mesma do áudio: **nada entra sem a pessoa ver.** A tela mostra cada linha
como vai ficar, e o que não dá pra ler vira erro visível — nunca valor
inventado. Um valor lido errado numa importação de 500 linhas estraga meses
de relatório em silêncio; um erro na prévia custa um clique.

## Fluxo

1. **Arquivo.** Só CSV, até 5 MB e 2000 linhas. `.xlsx` é recusado com
   instrução de como salvar em CSV. O arquivo é lido **no navegador** e não
   é enviado — só as linhas confirmadas viram lançamentos (está na política
   de privacidade).
2. **Colunas.** Data, descrição e valor são obrigatórias; categoria, cartão
   e tipo, opcionais. Se a primeira linha é cabeçalho, as colunas se
   mapeiam sozinhas por apelido ("Histórico", "Valor (R$)", "Lançamento"…),
   e a pessoa pode trocar.
3. **O que são as linhas.** Gastos, Renda, ou **Pelo sinal** (negativo =
   gasto, positivo = renda, como extrato de banco). Se houver coluna de
   tipo, ela decide linha por linha, e aceita investimento.
4. **Prévia** com contagem: quantas entram, quantas parecem já existir,
   quantas têm erro, quantas categorias novas.
5. **Importar.** Depois, "Desfazer" fica disponível ali e na lista de
   importações anteriores.

## O que o Excel brasileiro faz, e como é tratado

| Armadilha | Tratamento |
| --- | --- |
| Separador `;` (vírgula é decimal) | detecta `;`, `,` ou tab na 1ª linha, fora de aspas |
| Arquivo em Windows-1252, não UTF-8 | tenta UTF-8 estrito; se falhar, lê como Windows-1252 |
| `R$ 1.234,56`, espaço duro, `(87,50)`, `87,50-` | todos lidos; parênteses e sinal no fim = negativo |
| `1.500` | mil e quinhentos (grupo de 3 dígitos após ponto = milhar) |
| `03/04/2026` pode ser 3/abr ou 4/mar | olha a **coluna inteira** (abaixo) |
| Data com hora, ano com 2 dígitos, `12.09.2026` | aceitos; 31/02 é recusado |
| Aspas, `""`, quebra de linha dentro de célula | parser completo, não `split` |

**Dia/mês ou mês/dia.** Se alguma data tem o primeiro número > 12, é
dia/mês; se o segundo > 12, é mês/dia. Se todas têm os dois ≤ 12, não dá
pra saber: assume dia/mês e **avisa** pra conferir a prévia. Se a coluna tem
os dois casos, é planilha misturada: **bloqueia** a importação — qualquer
escolha erraria metade.

## Regras de cada linha

- **Valor** entra sempre positivo (o banco exige `amount > 0`); o sinal só
  serve pro modo "pelo sinal". Arredondado a centavos antes de validar — zero
  depois de arredondar é erro.
- **Categoria** (só gasto) casa sem diferenciar maiúscula nem acento.
  Categoria que não existe é criada (cor livre da paleta), ou, se a pessoa
  desmarcar, o gasto entra sem categoria com aviso.
- **Cartão** casa pelo nome. Achou: gasto no cartão. Não achou: entra como
  Pix, com aviso. Cartões arquivados não contam.
- **Tudo entra como lançamento avulso.** Recorrência e parcelamento não são
  importados: uma planilha de extrato já tem uma linha por mês, e projetar
  recorrência em cima disso contaria em dobro.
- **Duplicado:** mesmo tipo, data, valor e descrição de um lançamento que a
  pessoa **já tem** fica de fora por padrão, com opção de incluir. Repetição
  **dentro** do arquivo não é marcada — dois cafés iguais no mesmo dia são
  normais.

## Desfazer e falha no meio

Cada importação cria uma linha em `imports`; cada lançamento criado aponta
pra ela com `on delete cascade`. Então:

- **Desfazer** = apagar a linha de `imports`. O banco leva o resto.
- **Falha no meio** (ex: rede cai entre gastos e rendas): a tela apaga a
  linha de `imports` e o que já tinha entrado vai junto. Não fica
  importação pela metade.
- **Categorias criadas ficam** nos dois casos — não fazem mal e são
  apagáveis à mão. Apagar junto arriscaria levar uma categoria que a pessoa
  já passou a usar em lançamento manual.
- **Lançamento editado depois continua ligado à importação** e some se ela
  for desfeita. A tela diz isso antes.

## Ida e volta

"Baixar meus dados → Planilha (CSV)" em Ajustes gera um arquivo que esta
tela lê sem ajuste: colunas `tipo;data;descricao;valor;categoria;forma;cartao;
recorrencia;parcelas;termina_em;observacao`. As colunas extras são
informativas e ignoradas na volta — e recorrências voltam como avulsas
(regra acima).
