---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-PRISMA
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/backend-prisma-model-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  PRISMA-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  PRISMA-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  PRISMA-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  PRISMA-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  PRISMA-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  PRISMA-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `backend-prisma-model-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `PRISMA-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-prisma-model-generator/REPORT.md` |

Skill **com efeito destrutivo** (`prisma migrate dev` altera o banco real) → `disable-model-invocation: true` (SG-013) e `criticality: high`. Estado `draft`: ainda não validada pelo skill-audit; nenhum `REPORT.md` gerado, logo sem `score`/`governance-eval-score` projetado (SG-011).

Regras normativas da camada Prisma Model, cada uma coberta por um caso de eval comportamental:

- `PRISMA-001` — `id String @id @default(cuid())`, nunca `Int @id @default(autoincrement())`.
- `PRISMA-002` — `createdAt @default(now())` + `updatedAt @updatedAt` (regressão: esquecer o atributo `@updatedAt` → caso `regression-1`).
- `PRISMA-003` — `deletedAt DateTime?` presente (soft-delete universal).
- `PRISMA-004` — `userId String` + relação `User` com `onDelete: Cascade` em recurso multi-tenant (caso `edge-1` cobre quando NÃO aplicar a relação).
- `PRISMA-005` — `@@index([userId])` + `@@index([deletedAt])` (evita full-scan).
- `PRISMA-006` — `@@map("table_name")` em snake_case plural.

`score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão; ausentes enquanto a skill estiver em `draft`.
