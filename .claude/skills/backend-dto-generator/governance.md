---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-DTO
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-dto-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  DTO-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  DTO-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  DTO-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  DTO-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  DTO-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  DTO-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `backend-dto-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `DTO-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-dto-generator/REPORT.md` |

Regras normativas da camada DTO, cada uma coberta por um caso de eval comportamental:

- `DTO-001` — Update derivado de `Create.partial()` (não redefinir). Regressão conhecida: `UserDto.ts` redefine campo-a-campo → caso `regression-1`.
- `DTO-002` — `@openapi` acima do schema principal (docs.paths.ts depende).
- `DTO-003` — zero `z.any()`.
- `DTO-004` — type guards `is<X>` com `safeParse`.
- `DTO-005` — companion `I<Resource>` com `id/userId/createdAt/updatedAt/deletedAt?`.
- `DTO-006` — data de payload HTTP usa `z.coerce.date()`/`z.string().datetime()`, nunca `z.date()` cru (caso `edge-1`).

`eval-score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
