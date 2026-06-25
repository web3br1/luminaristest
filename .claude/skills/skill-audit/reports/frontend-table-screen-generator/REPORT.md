# Skill Audit Report — frontend-table-screen-generator

- Skill: `frontend-table-screen-generator` (id `SKL-FE-TABLE`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-negs; happy/edge/regression via batch-eval AST-aware, file-scoped). Regras: FETABLE-001..006.

## Execução
Geração em contexto limpo (subagente lê só o SKILL.md); seções por case-id; `batch-eval` AST (ast-jsx/ast-import:Name@module/ast-noclass) p/ JSX/TSX, file-scoped `@<file>::`, regex só p/ texto; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
FETABLE-002 useMemo genérico de-brittled + controle. ast-jsx:GenericTabbedView. Neighbor-neg → kanban.

## Skipped / blocked
Nenhum.
