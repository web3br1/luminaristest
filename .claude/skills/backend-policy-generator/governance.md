---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-BACKEND-POL
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/backend-policy-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  POL-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  POL-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  POL-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  POL-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  POL-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  POL-006:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  POL-007:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  POL-008:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `backend-policy-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `POL-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/backend-policy-generator/REPORT.md` |

Regras normativas da camada Policy, cada uma coberta por um caso de eval comportamental:

- `POL-001` — todo método `can*` retorna `boolean`; ZERO `throw` dentro deles (quem lança `ForbiddenError` é o service).
- `POL-002` — métodos obrigatórios presentes: `canCreate`, `canView`, `canUpdate`, `canDelete`, `canListAll`.
- `POL-003` — `canListAll` exige `actor?.role === Role.ADMIN` (listar todo o tenant é privilégio admin).
- `POL-004` — ownership em `canView`/`canUpdate`/`canDelete`: `actor?.id === ownerId || actor?.role === Role.ADMIN`.
- `POL-005` — classe `implements I<Resource>Policy` (a interface é o contrato injetado no service).
- `POL-006` — zero acesso a dados na policy: inspeciona só campos do `actor` já carregado; nunca consulta o banco (caso `regression-1`).
- `POL-007` — actor `IUser | null`; `null` → `false` (exceto signup público explícito) (caso `edge-1`).
- `POL-008` — imports de `../../users/models/User.model` (`IUser` type-only + `Role` local), nunca `@prisma/client`.

`status: draft` — skill ainda não validada; sem `score` projetado até o `REPORT.md` existir (SG-011).
`eval-score`/`last-evaluated` serão **projeção** do `REPORT.md` quando a skill for promovida — nunca editados à mão.
