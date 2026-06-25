# Skill Audit Report — backend-prisma-model-generator

- Skill: `backend-prisma-model-generator` (id `SKL-BACKEND-PRISMA`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos: 5/5 PASS (triggers via router-judge; happy/edge/regression via batch-eval mecânico).
Regras cobertas: PRISMA-001..006.

## Execução
Geração em contexto limpo por subagente lendo apenas o `SKILL.md` (sem ver as assertions); seções por case-id; verificação `skill-audit batch-eval` + controles de negação (`skill-audit controls`). Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle de negação provando que o gate ainda discrimina)
passou direto. disable-model-invocation:true (roda migrate).

## Skipped / blocked
Nenhum.
