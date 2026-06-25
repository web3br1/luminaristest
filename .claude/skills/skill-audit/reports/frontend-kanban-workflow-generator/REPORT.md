# Skill Audit Report — frontend-kanban-workflow-generator

- Skill: `frontend-kanban-workflow-generator` (id `SKL-FE-KANBAN`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-negs; happy/edge/regression via batch-eval AST-aware, file-scoped). Regras: FEKANBAN-001..006.

## Execução
Geração em contexto limpo (subagente lê só o SKILL.md); seções por case-id; `batch-eval` AST (ast-jsx/ast-import:Name@module/ast-noclass) p/ JSX/TSX, file-scoped `@<file>::`, regex só p/ texto; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
KanbanColumn→primitivos dnd-kit reais (DndContext/SortableContext); updateRecord→updateRecord(; overflow-x-auto legítimo→DndContext+onDragEnd. 3 controles. Neighbor-neg → table.

## Skipped / blocked
Nenhum.
