---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-API-SYNC
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/api-contract-sync-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  SYNC-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  SYNC-002:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  SYNC-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SYNC-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SYNC-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SYNC-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `api-contract-sync-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `SYNC-*` inline no contrato normativo) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/api-contract-sync-generator/REPORT.md` |

Regras normativas da fronteira de contrato backend↔frontend, cada uma coberta por um caso de eval comportamental:

- `SYNC-001` — tipos do frontend espelham 1:1 `Create/Update<X>Schema` do DTO (campos + opcionalidade).
- `SYNC-002` — todo campo enviado pelo frontend existe no DTO (sem campo a mais).
- `SYNC-003` — path **e** verbo do `apiClient` batem com a rota em `routes/<resource>.ts`.
- `SYNC-004` — zero `any` em payload/retorno.
- `SYNC-005` — tipos espelhados localmente (`my-app/types/`), nunca importados do `server/`.
- `SYNC-006` — resposta envelopada (`{ success, data }` / paginação) é desempacotada, não tratada como `T` cru.

Skill em `status: draft` — ainda não validada pelo skill-audit (SG-048); sem `score` projetado no frontmatter (SG-011) até o `REPORT.md` existir.

`eval-score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
