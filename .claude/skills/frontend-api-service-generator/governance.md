---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-API-SERVICE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-api-service-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEAPI-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEAPI-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEAPI-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEAPI-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEAPI-005:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  FEAPI-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-api-service-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEAPI-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-api-service-generator/REPORT.md` |

Regras normativas da camada Frontend Service, cada uma coberta por um caso de eval comportamental:

- `FEAPI-001` — toda chamada via `apiClient` (`../api/api-client`); nunca `fetch`/`process.env` direto.
- `FEAPI-002` — `export class <Resource>Service` com métodos `static async` tipados espelhando o backend.
- `FEAPI-003` — métodos expõem o envelope `{ success, data }` (com `pagination` nas listagens).
- `FEAPI-004` — tipos locais, mesmo nome do `Response` DTO, sem import de `server/` (regressão: drift de import → `regression-1`).
- `FEAPI-005` — zero `any` (caso `edge-1`).
- `FEAPI-006` — path bate exatamente com `/api/<x>` registrado no backend.

`eval-score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão. Skill em `draft`: ainda não validada pelo skill-audit (SG-048), sem `governance-eval-score` no frontmatter do `SKILL.md`.
