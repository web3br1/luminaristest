# Skill Audit Report — backend-dto-generator

- Skill: `backend-dto-generator` (id `SKL-BACKEND-DTO`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

| Check | Status | Evidence |
|---|---|---|
| structure / frontmatter | PASS | `validate` sem findings para a skill |
| rule→gate (6 regras) | PASS | `governance-check`: DTO-001..006 mapeadas |
| eval coverage | PASS | 5 casos; cada regra coberta |
| behavioral happy-1 | PASS | 6/6 assertions mecânicas (eval-assert) |
| behavioral edge-1 | PASS | 2/2 (z.coerce.date, sem z.date()) |
| behavioral regression-1 | PASS | 2/2 (.partial(), sem redefinição manual) |
| trigger-pos | PASS | router-judge: ativa corretamente |
| trigger-neg | PASS | router-judge: não ativa (pedido frontend) |

## Casos (5/5)

| id | tipo | regras | resultado |
|---|---|---|---|
| trigger-pos-1 | trigger-positive | — | PASS (model-judged) |
| trigger-neg-1 | trigger-negative | — | PASS (model-judged) |
| happy-1 | happy | DTO-001..005 | PASS (6/6) |
| edge-1 | edge | DTO-006 | PASS (2/2) |
| regression-1 | regression | DTO-001 | PASS (2/2) |

Score = 5/5 = 1.00.

## Evidência bruta

Output gerado em contexto limpo: `./_eval-happy-1.out.ts` (subagente executando a skill).
Assertions mecânicas: `node skill-audit.mjs eval-assert backend-dto-generator <caso> <out>`.

## Skipped / blocked

Nenhum.
