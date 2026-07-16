---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FULLSTACK-FEATURE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/fullstack-feature-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FULL-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FULL-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FULL-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FULL-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FULL-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FULL-006:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  FULL-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-2
  FULL-008:
    gates:
      - type: static
        target: ./SKILL.md
---

# Governança — `fullstack-feature-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FULL-*` inline em "Regras de composição") |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/fullstack-feature-generator/REPORT.md` |

Skill de **composição** (vertical slice ponta-a-ponta). As regras governam a **costura** e as **fronteiras** da
fatia — o texto de cada contrato-filho (DTO/Repo/Policy/Service/Controller/Route/Frontend) permanece canônico nas
sub-skills, **não** é re-testado aqui:

- `FULL-001` — compor a cadeia canônica na ordem (contrato → backend → frontend), sem pular elos.
- `FULL-002` — delegar aos contratos das sub-skills e reusar canônicos; não copiar instruções nem recriar "ilhas".
- `FULL-003` — UI (page + frontend service) livre de Prisma/DB; só `apiClient` → service layer.
- `FULL-004` — `Service`/`Repository` livres de React/JSX e de transporte (`Request`/`Response`/`res.json`).
- `FULL-005` — registro de rota = 2 toques (`routes/index.ts` + `@openapi` em `docs.paths.ts`); auth é deny-by-default e não entra no registro. Fonte única: `GENERATION_CONTRACTS.md` § Backend Route Contract.
- `FULL-006` — contrato compatível ponta-a-ponta: envelope + nomes de campo do backend == os do frontend service.
- `FULL-007` — testes dos dois lados (backend `jest` policy-first/not-found + frontend) incl. compat de contrato.
- `FULL-008` — `disable-model-invocation: true` (gate **static**, no frontmatter da `SKILL.md`): `--com-prisma` executa
  `prisma migrate` (efeito externo) ⇒ invocação só explícita. Gate determinístico — dispensa eval (SG-035).

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011); materializados na
promoção a `validated` pelo skill-audit (SG-048).
