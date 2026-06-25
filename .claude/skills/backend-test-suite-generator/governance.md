---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-TEST
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-test-suite-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  TEST-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  TEST-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  TEST-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  TEST-004:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  TEST-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  TEST-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-2
  TEST-007:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `backend-test-suite-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `TEST-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-test-suite-generator/REPORT.md` |

Regras normativas da camada Test Suite, cada uma coberta por um caso de eval comportamental:

- `TEST-001` — mocks padronizados + `jest.clearAllMocks()` no `beforeEach`, sem banco real (repo/prisma mockados).
- `TEST-002` — factory builder `buildService(overrides?)` com `mockRepo`/`mockPolicy`, sem instanciar service inline.
- `TEST-003` — asserção cross-tenant: recurso de outro usuário lança `NotFoundError` (não `ForbiddenError`) + repo chamado com `userId` do actor.
- `TEST-004` — shape real da suíte KPI: rows `{ id, data }`, chamada direta da função pura, suítes Empty/Math/Float Safety e `previousValue` undefined-ou-number.
- `TEST-005` — shape mínimo da suíte service: `getById` ok/`NotFoundError`/`ForbiddenError` + `delete` chama `softDelete`.
- `TEST-006` — shape da suíte middleware: token ausente/inválido rejeita, token válido popula `req`.
- `TEST-007` — determinismo: `referenceDate` fixo e money via `toBeCloseTo(value, 2)`, nunca `new Date()` solto nem `toBe`/`toEqual` em float.

`status: draft` — skill ainda não validada; `eval-score`/`score` ausentes de propósito (serão projeção do `REPORT.md` por SG-011 após a primeira execução do auditor). `last_evaluated` registra a data de autoria das regras, não uma execução de eval aprovada.
