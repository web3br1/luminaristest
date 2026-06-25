# Skill Audit Report — analytics-kpi-generator

- Skill: `analytics-kpi-generator` (id `SKL-ANALYTICS-KPI`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-neg; happy/edge/regression via batch-eval, file-scoped). Regras: AKPI-001..005. Domínio backend (.ts) — sem acoplamento acidental a React/Express/Prisma/transport.

## Execução
Geração em contexto limpo (subagente lê SKILL.md + suas evals); seções por case-id; `batch-eval` AST (ast-import) + text; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
passou direto; domain-boundary: absent React/apiClient/res/prisma no processor. Neighbor-neg → dashboard-kpi (end-to-end).

## Skipped / blocked
Nenhum.
