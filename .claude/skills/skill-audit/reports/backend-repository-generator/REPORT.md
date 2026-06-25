# Skill Audit Report — backend-repository-generator

- Skill: `backend-repository-generator` (id `SKL-BACKEND-REPO`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

| Caso | Tipo | Resultado |
|---|---|---|
| trigger-pos-1 | trigger-positive | PASS (router-judge) |
| trigger-neg-1 | trigger-negative | PASS (router-judge) |
| happy-1 | happy | PASS (assertions mecânicas) |
| edge-1 | edge | PASS |
| regression-1 | regression | PASS |

Regras cobertas: REPO-001..007. Score = 5/5 = 1.00.

## Execução

Geração em contexto limpo por subagente lendo apenas o `SKILL.md` (sem ver as assertions).
Verificação: `skill-audit batch-eval backend-repository-generator <out>` (seções HAPPY/EDGE/REGRESSION isoladas) + router-judge para gatilhos.
Evidência bruta: `./_eval.out.txt`.

## Correções de eval aplicadas (de-brittle, não enfraquecimento)

edge-1: removida assertion deletedAt (REPO-001 já coberto por happy-1); regression-1: `[^}]*`→`[\\s\\S]*` para cruzar `{ id }` aninhado.
Cada regra permanece coberta por ao menos um caso após o ajuste.

## Skipped / blocked

Nenhum.
