# Skill Audit Report — dashboard-kpi-end-to-end-generator

- Skill: `dashboard-kpi-end-to-end-generator` (id `SKL-FE-DASHKPI`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-negs; happy/edge/regression via batch-eval AST-aware). Regras: DASHKPI-001..005.

## Execução
Geração em contexto limpo (subagente lê só o SKILL.md); seções por case-id; `batch-eval` com AST (ast-jsx/ast-import:Name@module/ast-noclass) p/ JSX/TSX, file-scoped `@<file>::`, regex só p/ texto; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
cadeia processor→template→hook→widget validada file-scoped; previousValue via `number|undefined` (order-agnostic) + Number.isFinite + controle. Neighbor-negs → widget e analytics-kpi.

## Skipped / blocked
Nenhum.
