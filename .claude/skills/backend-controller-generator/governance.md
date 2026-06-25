---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-CTRL
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-controller-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  CTL-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  CTL-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CTL-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CTL-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  CTL-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CTL-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `backend-controller-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `CTL-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-controller-generator/REPORT.md` |

Regras normativas da camada Controller, cada uma coberta por um caso de eval comportamental:

- `CTL-001` — `Schema.safeParse(req.body)` com `return res.status(400)` ANTES de qualquer lógica (validação é a primeira coisa do handler).
- `CTL-002` — `getUserContextFromRequest(req)` extrai o actor; nunca parse manual do token.
- `CTL-003` — service obtido via `getFactory().get<Resource>Service()`, nunca `new`.
- `CTL-004` — sucesso sempre como `{ success: true, data }` (`res.status(201)` em criação), nunca shape ad-hoc.
- `CTL-005` — `handleApiError(error, res)` em todo `catch`, nunca `res.status(500).json()` manual.
- `CTL-006` — `return` antes de cada `res.json` para evitar "headers already sent" (caso `edge-1`).

Status `draft`: os gates ainda não foram executados pelo skill-audit. `eval-score`/`last-evaluated`
são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão; a promoção a `validated` cabe só
ao skill-audit (SG-048).
