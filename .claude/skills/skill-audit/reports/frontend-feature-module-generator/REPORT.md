# Skill Audit Report — frontend-feature-module-generator

- Skill: `frontend-feature-module-generator` (id `SKL-FE-FEATMOD`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-negs; happy/edge/regression via batch-eval AST-aware, file-scoped). Regras: FEMOD-001..005.

## Execução
Geração em contexto limpo (subagente lê só o SKILL.md); seções por case-id; `batch-eval` AST (ast-jsx/ast-import:Name@module/ast-noclass) p/ JSX/TSX, file-scoped `@<file>::`, regex só p/ texto; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
passou direto; AST validou exports (barrel) + boundaries (View→hook, sem lib/services na UI). Neighbor-neg → page.

## Skipped / blocked
Nenhum.
