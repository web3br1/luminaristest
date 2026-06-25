---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-SVC
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-service-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  SVC-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SVC-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  SVC-003:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  SVC-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  SVC-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  SVC-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SVC-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `backend-service-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `SVC-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-service-generator/REPORT.md` |

Regras normativas da camada Service, cada uma coberta por pelo menos um caso de eval comportamental:

- `SVC-001` — policy-check ANTES de qualquer acesso a dados (primeira linha do método).
- `SVC-002` — erros tipados de `lib/errors` (`ForbiddenError`/`NotFoundError`), nunca `null` cru ou `throw new Error`.
- `SVC-003` — cross-tenant retorna `NotFoundError`, não `ForbiddenError` (anti-enumeration) — caso `edge-1`.
- `SVC-004` — DI 100% por construtor (repo + policy injetados), zero `new <Resource>Repository()`/`Policy()`.
- `SVC-005` — zero `prisma.*` direto e zero Express/HTTP no service (agnóstico a transporte).
- `SVC-006` — `actor: IUser | null` importado de `../../users/models/User.model`, nunca `@prisma/client`.
- `SVC-007` — registro em `lib/factory.ts`: repo/policy antes do service + getter `get<Resource>Service()`.

Status `draft`: ainda **não validado** — sem `governance-eval-score`/`REPORT.md`. `eval-score`/`last-evaluated`
no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão; só aparecem quando a
skill for promovida a `validated`.
