# Fase D — Lançar gasto por áudio

**Status:** No ar desde 12/09/2026. A chave da Groq foi configurada na
Vercel; falta o teste de ponta a ponta (§4). No `.env.local` ela ainda não
está, então `npm run dev` cai no aviso de "não configurado" — só afeta teste
local.
**Depende de:** nada de banco. Nenhuma migração.
**Não depende de:** Fase E (foto). As duas são independentes.

---

## TL;DR

Um botão de microfone ao lado de "Novo gasto". A pessoa fala ("mercado, 87
reais no cartão"), o áudio vira texto, o texto vira campos, e o **formulário
de gasto abre preenchido** — e para aí. Ninguém salva sozinho. A pessoa
confere, ajusta o que a IA errou, e aperta "Salvar gasto" como sempre.

## A regra que não se negocia

IA erra valor e categoria com frequência normal — não é bug, é a natureza da
ferramenta. Deixar o áudio **salvar sem revisão** seria a única forma deste
app estragar dado financeiro de verdade sem ninguém perceber. Por isso a
resposta da IA é sempre uma *sugestão* que cai no mesmo formulário de
sempre. O texto transcrito vai para o campo "Observação", pra pessoa ver o
que a IA ouviu e apagar se quiser.

---

## 1. Como funciona

```
navegador                    servidor (Next)              Groq
──────────                   ───────────────              ────
grava (MediaRecorder)
  ≤ 30 s, webm/opus ou mp4
        │
        ├─ POST /api/audio ──▶ exige sessão
                               ≤ 3 MB
                                  ├─ transcrever() ──────▶ MODELOS_TRANSCRICAO
                                  │        ◀── texto ──────   (lista, em ordem)
                                  ├─ interpretarGasto() ─▶ MODELOS_TEXTO
                                  │   (com as categorias    (JSON estrito)
                                  │    da pessoa)
                                  │        ◀── {description, amount,
                                  │             category_name, payment_method}
        ◀── { texto, gasto } ────┘
formulário abre preenchido
pessoa confere e salva
```

- **`src/lib/ia.ts`** — as duas chamadas, isoladas. Cada tarefa tem uma
  *lista* de modelos, tentados em ordem: o catálogo visível depende da conta
  (ver §3.1), e provedor aposenta modelo com frequência. Sanitiza o que
  volta: valor tem que ser número positivo, categoria
  tem que bater com uma da lista, forma de pagamento tem que ser `pix` ou
  `card`. O que não passa vira `null` — o campo fica vazio no formulário.
- **`src/app/api/audio/route.ts`** — a única porta pra Groq. A chave mora
  aqui e nunca chega ao navegador. Exige sessão pra ninguém de fora gastar
  a cota. Sem chave configurada devolve 503 com texto claro, não 500.
- **`src/components/GravarGasto.tsx`** — o botão. Some sozinho em navegador
  sem `MediaRecorder`. Para em 30 s. Escolhe o formato que o navegador sabe
  gravar (Chrome/Android: webm; Safari iOS: mp4).
- **`/gastos`** — recebe a sugestão e abre o `Sheet` com o `Draft`
  preenchido. Categoria **e cartão** casam pelo nome, sem diferenciar
  maiúscula. Falar "no Itaú" seleciona o cartão Itaú.

  *Correção de 12/09:* a primeira versão não passava os cartões pra IA,
  com a justificativa de que "cartão é privado". Estava errado — privado é
  **entre pessoas da casa**, não entre a pessoa e o próprio app, que já
  conhece os cartões dela. Nome de cartão ("Itaú") também não é número de
  cartão. O resultado era falar "87 no Itaú" e ter que escolher o cartão na
  mão.

## 2. O que precisa de você

1. Conta em **console.groq.com** (grátis) → **API Keys** → criar uma.
2. **Na Vercel:** Settings → Environment Variables → `GROQ_API_KEY` = a
   chave, nos três ambientes. **Sem `NEXT_PUBLIC_`** — essa é a diferença
   entre uma chave de servidor e uma que vaza no bundle.
3. **No `.env.local`** (pra testar local): a mesma linha.
4. Redeploy (a Vercel não relê variável sem um deploy novo).

Até fazer isso, o botão existe e diz *"Lançar por áudio ainda não está
configurado neste app."* quando clicado. Nada mais é afetado.

## 3. Limites e riscos

- **Camada grátis é do app inteiro, não por pessoa.** A Groq limita
  requisições por minuto e por dia. Com dois usuários não chega perto; com
  cadastro público, todo mundo divide a mesma cota. Se estourar, a chamada
  falha e a pessoa vê "tente de novo ou digite o gasto" — dá pra viver com
  isso. Limite por usuário fica pra quando fizer falta (`PLANO_V2.md`).
- **Modelo indisponível pra chave.** Resolvido por construção: `ia.ts` tem
  uma *lista* de modelos por tarefa e tenta em ordem, caindo pro próximo
  quando vem 404 `model_not_found`. Só esse erro é engolido — cota, chave
  inválida e áudio recusado estouram na hora, porque trocar de modelo não
  ajudaria. Se um dia nenhum da lista existir, a mensagem diz quais foram
  tentados.
- **Permissão de microfone.** Primeiro uso pede permissão; PWA instalado no
  iOS às vezes pede de novo. A mensagem de erro aponta pra isso.
- **Custo zero hoje, não pra sempre.** Vale olhar o painel da Groq de vez
  em quando depois de abrir ao público.

## 3.1 Diagnóstico quando falha

A mensagem pra quem usa continua amigável, mas agora vem com um
**"Detalhe técnico"** expansível: o status e o começo do corpo que a Groq
devolveu. Sem isso — e sem acesso ao log da Vercel — "não deu para
processar" é indistinguível entre cota estourada, modelo aposentado e
formato de áudio recusado. Nunca contém a chave: `transcrever()` e
`interpretarGasto()` só repassam status e corpo da resposta.

**O que o primeiro teste real ensinou (12/09/2026).** O detalhe técnico
mostrou `interpretação 404: model_not_found` no `llama-3.3-70b-versatile`.
A transcrição tinha passado — ou seja, chave válida, áudio aceito, Whisper
ok. O modelo está na documentação como produção, mas a chave não tinha
acesso a ele: conta nova no plano grátis costuma ver um subconjunto menor
do catálogo.

A lição não é "trocar o nome do modelo" — é que **o catálogo visível
depende da conta**, e chutar outro nome só adiaria o mesmo 404. Daí a lista
com fallback. Vale para qualquer pessoa que for usar o app com a própria
chave, não só para esta.

## 4. Checklist de aceite

- [ ] Sem `GROQ_API_KEY`: botão aparece, clicar mostra o aviso de "não
      configurado", nada quebra.
- [ ] Com a chave: falar "mercado oitenta e sete reais no pix" abre o
      formulário com descrição "Mercado", valor 87, forma Pix, categoria
      Mercado (se existir).
- [ ] Falar sem valor ("aluguel do mês") abre com valor vazio — não
      inventado.
- [ ] Nada foi salvo antes de apertar "Salvar gasto".
- [ ] Áudio inaudível dá mensagem e o formulário continua disponível pra
      digitar.
