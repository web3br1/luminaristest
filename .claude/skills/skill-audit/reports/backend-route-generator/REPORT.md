# Skill Audit Report — backend-route-generator

- Skill: `backend-route-generator` (id `SKL-BACKEND-ROUTE`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos: 5/5 PASS (triggers via router-judge; happy/edge/regression via batch-eval mecânico).
Regras cobertas: ROUTE-001..006.

## Execução
Geração em contexto limpo por subagente lendo apenas o `SKILL.md` (sem ver as assertions); seções por case-id; verificação `skill-audit batch-eval` + controles de negação (`skill-audit controls`). Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle de negação provando que o gate ainda discrimina)
passou direto (assertions robustas já na autoria).

## Skipped / blocked
Nenhum.
