---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-WIDGET
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-widget-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEWIDGET-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FEWIDGET-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEWIDGET-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEWIDGET-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEWIDGET-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEWIDGET-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEWIDGET-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
---

# Governança — `frontend-widget-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEWIDGET-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-widget-generator/REPORT.md` |

Regras normativas da camada Frontend Widget, cada uma coberta por um caso de eval comportamental:

- `FEWIDGET-001` — superfície raiz `h-full w-full` compatível com `react-grid-layout`; nunca dimensões fixas em px (caso dedicado `edge-1`).
- `FEWIDGET-002` — estado **loading** explícito (skeleton/spinner durante `isLoading`).
- `FEWIDGET-003` — estado **error** explícito com retry button.
- `FEWIDGET-004` — estado **empty** explícito e distinto de loading/error.
- `FEWIDGET-005` — dados via `DashboardDataContext` (`useDashboardData()`) ou hook dedicado.
- `FEWIDGET-006` — props interface tipada e exportada, sem `any`.
- `FEWIDGET-007` — Galaxy theme (tokens `neutral`/`lumi-*`), nunca `zinc-*` (caso de regressão `regression-1`).

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
