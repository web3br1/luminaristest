# Skill Audit Report — frontend-widget-generator

- Skill: `frontend-widget-generator` (id `SKL-FE-WIDGET`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-negs; happy/edge/regression via batch-eval AST-aware). Regras: FEWIDGET-001..007.

## Execução
Geração em contexto limpo (subagente lê só o SKILL.md); seções por case-id; `batch-eval` com AST (ast-jsx/ast-import:Name@module/ast-noclass) p/ JSX/TSX, file-scoped `@<file>::`, regex só p/ texto; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
passou direto; ast-import:useDashboardData. Neighbor-neg → modal.

## Skipped / blocked
Nenhum.
