# Fase E — Recibo guardado, para o imposto de renda

**Status:** E1 e E2 implementadas em 13/09/2026. Falta você: bucket, token,
CORS, variáveis e migração 009 (§2 e §10). Decisões tomadas na implementação
estão em §10.
**Depende de:** conta na Cloudflare com um bucket R2 (§2). Sem isso, nada
desta fase funciona — e é a primeira fase do plano que depende de
infraestrutura que o projeto ainda não tem.
**Não depende de:** Fase D (áudio). São independentes, mas a §5 reusa a
lição que a D ensinou sobre modelo de IA.

---

## TL;DR

Um botão "Anexar recibo" no formulário de gasto. A foto vai **direto do
navegador para o Cloudflare R2**, sem passar pelo servidor, e fica ligada
ao lançamento. Uma tela nova lista os recibos por ano — feita pra ser
aberta uma vez, na época de declarar o imposto, e baixar tudo.

## As duas metades, e por que separá-las

Você pediu duas coisas que parecem uma:

1. **Guardar a foto** para quando a Receita pedir comprovante.
2. **Ler a foto com IA** para preencher o gasto sozinho.

**A primeira é o valor real; a segunda é conveniência.** Elas têm riscos
muito diferentes: guardar depende de infraestrutura que ou funciona ou não;
ler depende de IA, que erra e muda de catálogo (foi o que a Fase D
mostrou). Por isso vão separadas — **E1** entrega sozinha, e **E2** pode
nunca ser feita sem prejuízo.

Se a leitura por IA falhar ou sair do ar, o anexo continua funcionando.
Nunca o contrário.

---

## 1. Antes de tudo: isto muda a natureza do que você guarda

Até aqui o app guarda números que as pessoas digitaram. A partir desta
fase ele guarda **documentos**: um recibo tem CPF, endereço, o que a pessoa
comprou, às vezes dados de cartão parciais. Três consequências que valem
decisão consciente, não descoberta depois:

- **Com cadastro público, você passa a hospedar documento de estranhos.**
  Isso é diferente de hospedar o seu e o da Duda. Não sou advogado e não vou
  fingir que sou, mas vale saber que guardar documento de terceiros tem
  implicação de LGPD que um app de números não tinha.
- **O bucket precisa ser privado de verdade.** Bucket R2 público é um erro
  de uma linha no painel, e o custo dele aqui é alto: recibos indexáveis.
  O §2 insiste nisso.
- **Apagar conta precisa levar os arquivos junto.** A exclusão de conta já
  existe (`LGPD.md` §4) e apaga banco e usuário; esta fase acrescenta a parte
  do R2 — decidido que os recibos somem na hora (§8).

Nada disso bloqueia a fase. Só não quero que apareça como surpresa.

---

## 2. O que precisa de você (antes de eu escrever código)

1. **Conta na Cloudflare** (grátis) → **R2** → criar bucket, ex:
   `rumofacil-recibos`. Região automática está bom.
2. **Deixe o bucket privado.** É o padrão — não habilite domínio público
   nem acesso anônimo. O app serve os arquivos por link temporário
   assinado, não por URL pública.
3. **Token de API** com escopo **só desse bucket**, permissão de leitura e
   escrita de objeto. **Nunca o token de conta inteira.** Se essa chave
   vazar um dia, o estrago fica contido num bucket de recibos em vez da sua
   conta Cloudflare inteira.
4. **CORS no bucket** — permitir `PUT` a partir do domínio do app. Sem
   isso, o upload direto do navegador falha com um erro de CORS que **não
   aparece no log do servidor** (o servidor nem é chamado). É a falha mais
   chata desta fase; se acontecer, é quase sempre isto.
5. **Variáveis na Vercel** (todas de servidor, **sem `NEXT_PUBLIC_`**):
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET`.

Como no áudio: sem essas variáveis, o botão de anexar **não aparece** e o
resto do app segue igual.

---

## 3. E1 — Anexar e guardar

### 3.1 Por que o upload não passa pelo servidor

O caminho óbvio (navegador → Vercel → R2) esbarra em dois limites reais da
Vercel: tamanho de corpo na função serverless e tempo de execução. Foto de
celular tem 3–8 MB; alguns recibos são fotografados de perto, em sequência.
Passar por lá funciona até o dia em que não funciona.

O caminho certo: **o servidor só assina uma permissão temporária** (URL
pré-assinada, válida por alguns minutos) e o navegador faz o `PUT` direto
no R2. O arquivo nunca toca a Vercel. O servidor continua sendo quem
decide *se* pode subir — ele exige sessão antes de assinar.

```
navegador                       servidor (Next)            Cloudflare R2
──────────                      ───────────────            ─────────────
escolhe/tira foto
comprime (§3.4)
      │
      ├─ POST /api/recibo/assinar ─▶ exige sessão
      │                              monta a chave
      │        ◀── { url, key } ──── assina PUT (5 min)
      │
      ├─ PUT <url> (o arquivo) ──────────────────────────▶ guarda
      │
      ├─ insert em `receipts` (via RLS, como qualquer tabela)
      │
      └─ ao salvar o gasto, liga expense_id
```

Para **ver** depois, o mesmo desenho ao contrário: o servidor confere que o
recibo é seu e assina uma URL de leitura curta. O bucket nunca é público.

### 3.2 Banco (migração 009)

```sql
create table if not exists public.receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  -- Nulo é normal: a foto sobe antes do gasto existir, e pode ficar solta
  -- de propósito (recibo sem lançamento ainda).
  expense_id  uuid references public.expenses(id) on delete set null,
  r2_key      text not null unique,
  mime_type   text not null,
  size_bytes  int,
  -- A data que importa é a do gasto, não a do upload: é por ela que a
  -- tela do imposto agrupa.
  occurred_on date not null default current_date,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists receipts_user_idx on public.receipts (user_id, occurred_on);
create index if not exists receipts_expense_idx on public.receipts (expense_id);
```

**RLS: privado como cartão.** Recibo é prova de gasto de uma pessoa só —
nem na visão "todos" da casa o outro vê. Mesma regra de `cards` e
`bank_accounts`, pelos mesmos motivos.

```sql
alter table public.receipts enable row level security;

drop policy if exists receipts_select_own on public.receipts;
create policy receipts_select_own on public.receipts
  for select using (user_id = auth.uid());

drop policy if exists receipts_write_own on public.receipts;
create policy receipts_write_own on public.receipts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### 3.3 A chave do objeto no R2

```
<user_id>/<ano>/<uuid>.<ext>
```

O `user_id` na frente não é segurança (quem garante é a URL assinada) — é
organização: é o que deixa a exclusão de conta apagar tudo de uma pessoa
com um prefixo só. O ano facilita listar o que interessa na época do
imposto.

### 3.4 Comprimir antes de subir

Foto de celular moderna tem 3–8 MB. Um recibo legível cabe em 300–600 KB.
A diferença decide quanto tempo os 10 GB grátis duram:

| Sem comprimir (~5 MB) | Comprimido (~400 KB) |
| --- | --- |
| ~2.000 recibos | ~25.000 recibos |

A compressão acontece **no navegador**, com canvas: redimensiona pro lado
maior ter no máximo ~1600px e exporta JPEG com qualidade ~0.75. Recibo de
supermercado continua legível — é texto grande e contrastado. Se um dia não
ficar, dá pra subir a qualidade num lugar só.

Também impede o caso chato de quem fotografa em 48 MP e espera 40 segundos
de upload no 4G.

### 3.5 Onde aparece

- **No formulário de gasto:** botão "Anexar recibo" (câmera ou galeria).
  Miniatura depois de subir, com "Remover".
- **Na lista de gastos:** um clipe discreto no item que tem recibo.
- **Tela nova, `/recibos`:** lista por ano, com filtro de mês, miniatura,
  valor e descrição do gasto ligado (quando houver), e botão de baixar.
  Pensada pra ser aberta uma vez por ano.

### 3.6 Consentimento para guardar recibos

Recibo de farmácia ou clínica é **dado de saúde**, que a LGPD trata como
sensível (art. 11) e que exige consentimento específico — o aceite genérico
dos termos no cadastro não basta.

**Já existe (migração 008):** a coluna `receipts_consent_at` em `profiles`,
e dois lugares pra dar o consentimento:

- **no cadastro**, numa caixa **separada, opcional e desmarcada** (marcar
  não é condição pra criar a conta — senão o consentimento não é livre);
- **em Ajustes → Recibos**, onde também dá pra retirar.

**E o terceiro (feito na Fase E):** se a pessoa não consentiu, o botão de
anexar abre uma explicação curta em vez da câmera: a imagem fica guardada,
pode conter dado de saúde, pode ser apagada a qualquer momento, e, se a
leitura por IA for usada, é enviada a provedor no exterior. Permite ou não
anexa. **O servidor confere de novo** antes de assinar o envio — a tela é
conveniência, não a trava.

**Retirar o consentimento com recibos já guardados:** retirar é pedir pra
parar de tratar, e guardar é tratar. Ajustes avisa quantos recibos existem e
a retirada passa por `/api/recibos/retirar-consentimento`, que apaga os
arquivos do R2 (por prefixo), as linhas, e só então zera a coluna.

### 3.7 Recibo órfão

Se a pessoa sobe a foto e desiste do gasto, a linha fica com `expense_id`
nulo. **Isso é um estado válido, não lixo** — "tenho o comprovante, lanço
depois" é um uso legítimo. Eles aparecem em `/recibos` marcados como "sem
lançamento", e de lá dá pra ligar a um gasto ou apagar.

O que não pode existir é arquivo no R2 **sem** linha no banco (upload que
subiu e a inserção falhou). Nesse caso o arquivo fica invisível e ocupando
espaço.

**Decidido na implementação: a linha nasce antes do arquivo**, com
`uploaded_at` nulo. Ver §10.

---

## 4. E2 — Ler o recibo com IA (opcional)

Mesmo desenho da Fase D, mesma regra inegociável: **a IA sugere, a pessoa
confirma.** Depois de anexar, o app oferece "Ler recibo": manda a imagem
para um modelo com visão e devolve descrição, valor e data sugeridos, que
caem no formulário aberto. Nada é salvo sozinho.

**A lição da Fase D aplica-se inteira aqui:** o catálogo de modelos
*depende da conta*, não só do provedor. Então a leitura de imagem usa a
mesma `comFallback()` já escrita em `src/lib/ia.ts`, com uma lista de
modelos de visão — e se nenhum estiver disponível para a chave, o botão
"Ler recibo" some e **o anexo continua funcionando normalmente**.

Um detalhe que muda o custo: a imagem enviada para a IA deve ser a
**versão comprimida**, não a original. Modelo de visão cobra por tamanho de
imagem, e recibo comprimido lê igual.

---

## 5. Custo e limites

O R2 é escolha boa aqui por um motivo específico: **não cobra egress**
(saída de dados). Baixar recibos na época do imposto não gera conta.

| Recurso | Grátis por mês | Onde isso morde |
| --- | --- | --- |
| Armazenamento | 10 GB | ~25 mil recibos comprimidos |
| Escritas | generoso | 1 por upload |
| Leituras | generoso | 1 por miniatura ou download |
| Egress | ilimitado | — |

Com vocês dois, folgadíssimo. Com cadastro público, o uso de todo mundo
soma no **seu** bucket — mesma observação que vale pra Groq. Se crescer,
o caminho é limite por conta, não desligar a feature.

---

## 6. O que não está nesta fase

- **PDF de recibo.** Só imagem. PDF exige outro visualizador e a maioria
  dos comprovantes que importam é foto.
- **Busca dentro do recibo (OCR indexado).** A IA lê para *sugerir campos*,
  não para virar índice pesquisável. Se um dia fizer falta, o texto lido
  pode ser guardado numa coluna e aí sim pesquisado.
- **Exportar tudo num zip.** Baixar um por um resolve o caso real (a
  Receita pede comprovante específico, não a pasta inteira). Se incomodar,
  é acréscimo.
- **Apagar conta e os arquivos junto.** Ver §8.

---

## 7. Checklist de aceite

- [ ] Sem as variáveis do R2: o botão de anexar não aparece; nada quebra.
- [ ] Com elas: tirar foto pelo celular anexa e mostra miniatura.
- [ ] A foto que chega no R2 está comprimida (algumas centenas de KB, não
      megabytes).
- [ ] Abrir a URL do objeto no R2 **sem** o link assinado dá acesso negado.
- [ ] O recibo da Duda não aparece pra mim nem na visão "todos".
- [ ] `/recibos` lista por ano e o download funciona.
- [ ] Um recibo sem gasto ligado aparece como "sem lançamento", não some.
- [ ] Anexar continua funcionando com a leitura por IA fora do ar.

## 8. Pendências que esta fase cria

- **Apagar conta — decidido em 12/09/2026, feito em 13/09:** excluir a conta
  apaga todos os recibos da pessoa **na hora**. `/api/conta/excluir` apaga os
  objetos com prefixo `<user_id>/` **antes** de apagar o usuário. Se o R2
  falhar, a exclusão para inteira ("nada foi apagado") — melhor que deixar
  foto de documento sem dono.
- **SMTP próprio.** Continua pendente desde a Fase B, e continua sendo o
  que trava a divulgação.

## 9. Ordem de execução

| Passo | Quem |
| --- | --- |
| 1. Criar bucket, token restrito e CORS (§2) | Você |
| 2. Variáveis na Vercel e no `.env.local` | Você |
| 3. Migração 009 (§3.2) | Eu escrevo, você roda |
| 4. E1: assinar, subir, listar, baixar (§3) | Eu |
| 5. Checklist (§7) | Os dois |
| 6. E2: leitura por IA (§4), se quiser | Eu |

---

## 10. Como ficou (13/09/2026)

### Arquivos

| Onde | O quê |
| --- | --- |
| `supabase/migrations/009_recibos.sql` | tabela, trava de chave, trigger, RLS, grants |
| `src/lib/r2.ts` | assinar envio/leitura, conferir, apagar, apagar por prefixo |
| `src/lib/recibos-servidor.ts` | sessão, cliente admin, `recibosAtivos()` |
| `src/lib/recibos.ts` | navegador: comprimir, enviar em 3 passos, apagar, ler |
| `src/app/api/recibos/assinar` | cria a linha e assina o PUT (confere consentimento) |
| `src/app/api/recibos/[id]/confirmar` | HEAD no R2, marca `uploaded_at` |
| `src/app/api/recibos/[id]/arquivo` | 302 pra link de leitura de 5 min (`?baixar=1`) |
| `src/app/api/recibos/[id]` | DELETE: arquivo primeiro, linha depois |
| `src/app/api/recibos/[id]/ler` | E2: R2 → Groq visão → sugestão |
| `src/app/api/recibos/retirar-consentimento` | apaga tudo e zera a coluna |
| `src/components/AnexarRecibos.tsx` | botão, consentimento, miniaturas, "Ler recibo" |
| `src/app/(painel)/recibos/page.tsx` | por ano e mês, baixar, ligar a gasto, apagar |

### Decisões

**Envio em três passos, com a linha antes do arquivo.** `assinar` cria a
linha (`uploaded_at` nulo) e devolve o link; o navegador faz o PUT;
`confirmar` faz HEAD no R2 e só então marca `uploaded_at` e `size_bytes`.
Resultado: nunca existe arquivo sem linha. Se o PUT falhar, o navegador
apaga a linha. Se a confirmação falhar (sinal caiu no fim), a linha aparece
em Recibos como "envio não concluído", com "Conferir envio" e "Apagar".

**O link assinado não limita tamanho nem tipo** (a biblioteca não assina
esses cabeçalhos). Quem limita é a confirmação: arquivo acima de 3 MB ou que
não é imagem é apagado na hora.

**Três travas no banco, cada uma contra uma coisa:**

| Trava | Protege contra |
| --- | --- |
| chave do R2 começa com o `user_id` (check) | criar linha apontando pro arquivo de outra pessoa e pedir link de leitura |
| trigger `receipts_gasto_do_dono` | ligar recibo ao gasto de outra pessoa da casa (FK não passa pela RLS) |
| grants por coluna | a pessoa marcar `uploaded_at` sozinha, sem o servidor conferir |

**`recibosAtivos()` exige R2 e `SUPABASE_SECRET_KEY`**, porque é com a chave
secreta que o servidor grava `uploaded_at`. O layout passa só o sim/não pro
navegador (`recursos` no `ScopeProvider`).

**Compressão** com `createImageBitmap` (respeitando a rotação do EXIF) e
fallback pra `<img>`, lado maior 1600 px, JPEG 0,75. Se a foto já era JPEG
menor que o resultado, sobe a original.

**Gasto novo:** a foto sobe solta e é ligada ao salvar, junto com
`occurred_on` = data do gasto. Cancelar o formulário deixa a foto em
Recibos, "sem lançamento" — o componente avisa.

**E2 só preenche campo vazio.** O que a pessoa digitou não é sobrescrito;
se o recibo diverge, vira aviso. Exceção: em gasto novo a data do formulário
é só o padrão (hoje), então a do recibo entra. O prompt manda não devolver
CPF, endereço, nome de remédio nem dado de cartão.

**Termos:** `TERMOS_VERSAO` subiu pra 2026-09-13 (a política agora descreve
recibos e leitura por IA como recursos ativos).

### CORS do bucket (item 4 do §2)

No painel do R2 → bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": ["https://financascasal-pi.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Sem isso o envio falha com "Não deu para enviar a foto" e o detalhe técnico
"Failed to fetch" — e nada aparece no log da Vercel.
