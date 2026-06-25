---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-KANBAN
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-kanban-workflow-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEKANBAN-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEKANBAN-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEKANBAN-003:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  FEKANBAN-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEKANBAN-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEKANBAN-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-kanban-workflow-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEKANBAN-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-kanban-workflow-generator/REPORT.md` |

Regras normativas da camada Frontend Kanban Workflow, cada uma coberta por um caso de eval comportamental:

- `FEKANBAN-001` — reusa os primitivos canônicos do board (`InternalKanbanView`/`KanbanColumn` + `@dnd-kit`: `DndContext`/`DragOverlay`); nunca um board estático bespoke. Cobre o incidente em `regression-1`.
- `FEKANBAN-002` — colunas filtradas pelo pai ativo (`stage-relation`) ou pelas opções do enum (`status-enum`); nunca todas as etapas de todos os pais.
- `FEKANBAN-003` — drag-end: `updateRecord` otimista + rollback (sem efeitos) OU endpoint de transição atômico (com efeitos colaterais); caso dedicado `edge-1`.
- `FEKANBAN-004` — detalhe do card via modal canônico (`KanbanCardDetailModal`), nunca `router.push` para rota de detalhe; modal de captura quando a etapa exige input.
- `FEKANBAN-005` — criar via `FloatingActionButton`; filtros via filter bar; resolve tabelas por `internalName` e pagina (fetch-all) ao ler.
- `FEKANBAN-006` — container full-height (`flex h-full … flex-col`) + Galaxy theme: `neutral-*` (nunca `zinc-*`), `rounded-2xl`, sem `max-w-*` no board.

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
