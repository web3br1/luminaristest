---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-REPO
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-repository-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  REPO-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  REPO-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  REPO-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  REPO-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  REPO-005:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  REPO-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  REPO-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `backend-repository-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `REPO-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-repository-generator/REPORT.md` |

Regras normativas da camada Repository, cada uma coberta por um caso de eval comportamental:

- `REPO-001` — `where: { ..., deletedAt: null }` em TODOS os finds; sem o filtro, registros soft-deletados vazam.
- `REPO-002` — soft-delete via `update({ data: { deletedAt: new Date() } })`, NUNCA `prisma.<model>.delete()`. Regressão conhecida: `UserRepository` usa hard-delete (model sem `deletedAt`) → caso `regression-1`.
- `REPO-003` — `findAll` paginado via `prisma.$transaction([findMany, count])`, não duas queries sequenciais.
- `REPO-004` — `implements I<Resource>Repository`; a interface é o contrato que o service injeta.
- `REPO-005` — zero regra de negócio no repository (sem policy/validação/cálculo de domínio).
- `REPO-006` — `select` explícito excluindo campos sensíveis (password, tokens) em queries públicas.
- `REPO-007` — tipos Prisma de `'generated/prisma'`, nunca `@prisma/client` (output path customizado).

`status: draft` — skill ainda não validada; `evaluation.score` ausente até o primeiro REPORT.
`eval-score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
