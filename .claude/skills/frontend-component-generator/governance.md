---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-COMPONENT
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-component-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FECOMP-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FECOMP-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FECOMP-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FECOMP-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FECOMP-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FECOMP-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-component-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FECOMP-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-component-generator/REPORT.md` |

Regras normativas da camada Frontend Component, cada uma coberta por um caso de eval comportamental:

- `FECOMP-001` — interface de props tipada no mesmo arquivo, zero `any`; caso dedicado `edge-1` (form field tipado).
- `FECOMP-002` — componente funcional exportado `export const <Name>: React.FC<<Name>Props>`.
- `FECOMP-003` — Galaxy theme: superfícies dark em `neutral-*` (nunca `zinc-*`), cards `rounded-2xl`; regressão `regression-1` (uso de `zinc-*`).
- `FECOMP-004` — variantes dark mode presentes (`dark:bg-neutral-*`, `dark:text-*`).
- `FECOMP-005` — tipo `modal`: props `isOpen`/`onClose`/`onConfirm?`.
- `FECOMP-006` — tipo `form-field`/`card` com dados: loading (`LoadingSpinner`) e empty state.

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
