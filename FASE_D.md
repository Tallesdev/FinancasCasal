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
                                  ├─ transcrever() ──────▶ whisper-large-v3-turbo
                                  │        ◀── texto ──────
                                  ├─ interpretarGasto() ─▶ llama-3.3-70b-versatile
                                  │   (com as categorias    (JSON estrito)
                                  │    da pessoa)
                                  │        ◀── {description, amount,
                                  │             category_name, payment_method}
        ◀── { texto, gasto } ────┘
formulário abre preenchido
pessoa confere e salva
```

- **`src/lib/ia.ts`** — as duas chamadas, isoladas. Os nomes dos modelos são
  constantes no topo: provedor troca modelo com frequência, e a troca é uma
  linha. Sanitiza o que volta: valor tem que ser número positivo, categoria
  tem que bater com uma da lista, forma de pagamento tem que ser `pix` ou
  `card`. O que não passa vira `null` — o campo fica vazio no formulário.
- **`src/app/api/audio/route.ts`** — a única porta pra Groq. A chave mora
  aqui e nunca chega ao navegador. Exige sessão pra ninguém de fora gastar
  a cota. Sem chave configurada devolve 503 com texto claro, não 500.
- **`src/components/GravarGasto.tsx`** — o botão. Some sozinho em navegador
  sem `MediaRecorder`. Para em 30 s. Escolhe o formato que o navegador sabe
  gravar (Chrome/Android: webm; Safari iOS: mp4).
- **`/gastos`** — recebe a sugestão e abre o `Sheet` com o `Draft`
  preenchido. Categoria casa pelo nome (sem diferenciar maiúscula). Se a IA
  disse "cartão", a pessoa ainda escolhe **qual** cartão — cartão é privado,
  a IA não sabe quais existem.

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
- **Modelo aposentado.** Quando acontecer, o erro aparece no log da Vercel
  como `transcrição 4xx` ou `interpretação 4xx`. Trocar a constante em
  `src/lib/ia.ts` e redeployar.
- **Permissão de microfone.** Primeiro uso pede permissão; PWA instalado no
  iOS às vezes pede de novo. A mensagem de erro aponta pra isso.
- **Custo zero hoje, não pra sempre.** Vale olhar o painel da Groq de vez
  em quando depois de abrir ao público.

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
