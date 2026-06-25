---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-TABLE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-table-screen-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FETABLE-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FETABLE-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FETABLE-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FETABLE-004:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  FETABLE-005:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  FETABLE-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-table-screen-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FETABLE-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-table-screen-generator/REPORT.md` |

Regras normativas da camada Frontend Table Screen, cada uma coberta por um caso de eval comportamental:

- `FETABLE-001` — reusa o stack canônico `GenericTabbedView` (import + `<GenericTabbedView>`); nunca uma `<table>` bespoke.
- `FETABLE-002` — resolve a `IDynamicTable` por `internalName` (com fallback de nome), nunca `[0]`; `useMemo`.
- `FETABLE-003` — estados loading / error / tabela-não-instalada tratados.
- `FETABLE-004` — CRUD inline (`FloatingActionButton`/`EditRecordButton`/`ConfirmDeleteModal` soft-delete) + filtros + paginação vêm do stack.
- `FETABLE-005` — a página carrega o namespace `database` em `serverSideTranslations`; caso dedicado `regression-1`.
- `FETABLE-006` — leitura paginada (fetch-all) + Galaxy theme: `neutral-*` (nunca `zinc-*`), `rounded-2xl`, container full-height.

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
