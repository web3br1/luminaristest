# Skill Audit Report — backend-controller-generator

- Skill: `backend-controller-generator` (id `SKL-BACKEND-CTRL`, v1.0.1)
- Executed at: 2026-07-16
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

| Caso | Tipo | Resultado 2026-07-16 |
|---|---|---|
| trigger-pos-1 | trigger-positive | não re-executado (herdado 2026-06-25) |
| trigger-neg-1 | trigger-negative | não re-executado (herdado 2026-06-25) |
| happy-1 | happy | PASS 9/9 (assertions mecânicas) |
| edge-1 | edge | PASS 3/3 |
| regression-1 | regression | PASS 2/2 |

Regras cobertas: CTL-001..006. Score = 3/3 casos de código = 1.00.

## Execução

Geração em contexto limpo por subagente lendo apenas o `SKILL.md` (sem ver as assertions).
Verificação: `skill-audit batch-eval backend-controller-generator <out>` (seções por case-id) — router-judge dos gatilhos **não** re-executado.
Evidência bruta: `./_eval.out.txt`.

**1ª tentativa invalidada e refeita.** Deu 0/3 porque o prompt de geração não proibia narração: o modelo abria com "Espelhei o controller X… ZERO `prisma.*`, ZERO regra de negócio", e `absent:prisma.` reprovava o auto-atestado de conformidade. Diagnóstico completo no REPORT de `backend-route-generator`.

## Correções de eval aplicadas (de-brittle, não enfraquecimento)

**2026-07-16 — política ratificada pelo dono: o eval crava a PROPRIEDADE, não a forma canônica.** Duas assertions mediam grafia:

| Caso | Antes | Agora | Por quê |
|---|---|---|---|
| `regression-1` (CTL-001) | `if\s*\(!parse\.success\)…return\s+res\.status\(400\)` | ~~`if\s*\(\s*!\w+\.success\s*\)[\s\S]{0,80}res\.status\(400\)`~~ **REVERTIDO 2026-07-17** | ~~exigia o **nome da variável** `parse`… A ORDEM (`safeParse` antes de `getFactory`) — que **é** a regra CTL-001 — continua medida pela 1ª assertion~~ — **as duas afirmações eram falsas.** Tirar o nome da variável estava certo; junto foi o **`return\s+`**, que não é forma: sem ele o handler responde 400 e **segue** executando o service com body inválido, e o texto normativo diz literalmente "`safeParse` com `return res.status(400)`". Perda estrita de detecção. E a ORDEM relativa a `getFactory` **não é** a regra: um handler que chama `getFactory().getAuditService()` **antes** de validar passa, porque existe um 2º `getFactory()` depois do `safeParse`. Ver seção 2026-07-17 |
| `edge-1` (CTL-004/006) | `return\s+res\.json\(\{\s*success:\s*true` | `return\s+res(\.status\(200\))?\.json\(\{\s*success:\s*true` | reprovava `res.status(200).json(…)`, semanticamente idêntico ao `res.json(…)` |

**Controle de negação (prova que o gate ainda discrimina):** handler que obtém o service **antes** de validar e devolve envelope cru —
```
const svc = getFactory().getInvoiceService();
const parsed = CreateInvoiceSchema.safeParse(req.body);   // sem guard de 400
…
return res.json(invoice);                                  // sem { success: true }
```
→ `regression-1` **0/2** e `edge-1` reprova. É a regressão literal do `regression_of` ("chama o service/prisma antes de validar o body").

Histórico 2026-06-25: regression-1 regex passou a aceitar `if (...) { return }` com chave (de-brittle).

## Skipped / blocked

- Casos de trigger (`trigger-pos-1`, `trigger-neg-1`): não re-executados — exigem router-judge, fora do `batch-eval`.

---

## 2026-07-17 — CTL-001 remedido contra suíte adversarial

**Score segue 1.00 (3/3 casos), mas agora o 1.00 está lastreado.** O anterior media assertions que não
discriminavam; este foi medido contra **17 fixtures escritos por um agente adversário cego às assertions
e antes delas** (`evals/adversarial/regression-1.json`), e roda em todo `skill-audit run` via o gate novo
`adversarial`.

| | antes | agora |
|---|---|---|
| negativos barrados | 7 / 10 | **9 / 10** (o 10º é fora de escopo, declarado) |
| respostas CORRETAS aceitas | 4 / 7 | **7 / 7** |

**Os 3 negativos que escapavam** — e nenhum deles teria sido escrito por mim, que escrevi a assertion:
- `bad-2` **falta só o `return`** (7 caracteres). Ordem impecável, `safeParse` na 1ª linha, 400 presente.
  Runtime: responde 400 e segue executando o service com body inválido (`ERR_HTTP_HEADERS_SENT`).
  Era exatamente o furo que a revisão anterior **abriu**.
- `bad-8` efeito colateral (`recordAttempt`) **antes** do bloco de validação. Derrotava a assertion de
  ordem porque há um 2º `getFactory()` depois do `safeParse`.
- `bad-10` validação embrulhada em `if (process.env.NODE_ENV !== 'production')` — todos os tokens, na
  ordem certa, e não valida em produção.

**Os 3 falsos-reprovados** (assertion frágil reprovando código correto): destructuring `const { success }`
(o token `x.success` some), `parseResult.success === false`, e `res\n.status(400)` quebrado em linhas.

**Correção — de distância para posição+adjacência.** (1) o `safeParse(req.body)` tem de ser a **primeira
instrução** do corpo do handler (ancorado na assinatura `(req:…, res:…)`, tolerando `try {` e
comentários) — mede POSIÇÃO, não distância; (2) o guard tem de ser a instrução **imediatamente seguinte**
e **retornar**. A adjacência importa: medir só a forma do guard aceita `if (!invoice) return res.status(400)`
**depois** do service (`bad-4`) — o resultado do `safeParse` nunca é checado e a validação vira decoração.

**Verificação que teria falhado se eu estivesse errado:** as assertions novas, mais estritas, rodam contra
o **output real capturado** (`_eval.out.txt`) e dão `regression-1 2/2` — não fiquei restritivo a ponto de
reprovar a saída boa de verdade.

**Teto declarado:** `bad-9` (valida certo, mas usa `new InvoiceService(`/`prisma.`) passa neste caso **de
propósito** — é CTL-003, não CTL-001. Não é lacuna: foi **verificado** que `happy-1` o reprova via
`absent:new InvoiceService(` e o regex `getFactory().getInvoiceService()`. Cobrir aqui misturaria regras e
sujaria o mapa regra→gate.
