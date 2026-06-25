---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-HOOK
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-hook-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEHOOK-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEHOOK-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEHOOK-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEHOOK-004:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  FEHOOK-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEHOOK-006:
    gates:
      - type: eval
        target: ./evals/evals.json#state-1
  FEHOOK-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-hook-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEHOOK-*` inline no contrato/anti-patterns) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-hook-generator/REPORT.md` |

Regras normativas da camada Hook, cada uma coberta por pelo menos um caso de eval comportamental:

- `FEHOOK-001` — naming `useXxx` (prefixo `use` no arquivo e no export).
- `FEHOOK-002` — fetch via service layer (`lib/services/*`); nunca `apiClient` direto no hook.
- `FEHOOK-003` — estado tripartido `data`/`loading`/`error` exposto via `useState`.
- `FEHOOK-004` — DynamicTable: fetch-all paginado (`fetchAllRows`/`totalPages`), não confiar no default de 50 linhas.
- `FEHOOK-005` — `useEffect` com cleanup e deps array correto (flag de cancelamento).
- `FEHOOK-006` — sem regra de negócio no hook; dados derivados em `useMemo([deps])`.
- `FEHOOK-007` — sem `any`/`any[]` local; interfaces mínimas + `catch (e)` com narrowing por `unknown`.

Status `draft`: a skill ainda **não** é descobrível em produção (SG-005). `eval-score`/`governance-eval-score` só são projetados no frontmatter (SG-011) após o `REPORT.md` ser gerado pelo `skill-audit` e a skill ser promovida a `validated` (SG-048).
