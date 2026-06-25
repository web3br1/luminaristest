---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-ROUTE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-route-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  ROUTE-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  ROUTE-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  ROUTE-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  ROUTE-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  ROUTE-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  ROUTE-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `backend-route-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `ROUTE-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-route-generator/REPORT.md` |

Regras normativas da camada Route, cada uma coberta por um caso de eval comportamental:

- `ROUTE-001` — toque 1: `import`/`router.use('/<resource>', ...)` em `routes/index.ts`.
- `ROUTE-002` — toque 2: `'/api/<resource>'` no array `protectedApiPaths` de `middleware/auth.ts`. Regressão conhecida: rota wired em index.ts mas esquecida no allowlist → 401 com token válido → caso `regression-1`.
- `ROUTE-003` — toque 3: bloco `@openapi paths:` por endpoint em `docs.paths.ts`, antes de `* components:` (component schema do DTO não substitui o bloco de path) — caso `edge-1`.
- `ROUTE-004` — `export default router` sobre `Router()` de `express`.
- `ROUTE-005` — zero lógica no arquivo de rota (sem auth inline, validação ou try/catch).
- `ROUTE-006` — handlers importados por funções nomeadas existentes do controller.

`eval-score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão. Status `draft`: ainda não promovida a `validated` pelo skill-audit (SG-048).
