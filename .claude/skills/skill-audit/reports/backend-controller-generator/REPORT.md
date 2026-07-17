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
| `regression-1` (CTL-001) | `if\s*\(!parse\.success\)…res\.status\(400\)` | `if\s*\(\s*!\w+\.success\s*\)[\s\S]{0,80}res\.status\(400\)` | exigia o **nome da variável** `parse`; reprovava um handler correto que chamou de `bodyResult`. Nome de variável não tem consequência de runtime. A ORDEM (`safeParse` antes de `getFactory`) — que **é** a regra CTL-001 — continua medida pela 1ª assertion |
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
