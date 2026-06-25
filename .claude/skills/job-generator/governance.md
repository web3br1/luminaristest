---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-JOB
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/job-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  JOB-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  JOB-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  JOB-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-2
  JOB-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-2
  JOB-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#happy-2
  JOB-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  JOB-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  JOB-008:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `job-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `JOB-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/job-generator/REPORT.md` |

Regras normativas da camada **Job / Seed** (background job em `server/src/jobs/` ou seed de volume em
`server/scripts/seed-*-demo.js`), cada uma coberta por ao menos um caso de eval comportamental:

- `JOB-001` — re-rodar é reentrante: o seed não duplica nem corrompe (marca + limpa antes de reinserir).
- `JOB-002` — cada registro semeado leva `data.__demo = true`; no início, apaga os `__demo` anteriores
  (`findMany` → filtra `r.data.__demo === true` → `deleteMany`) antes de reinserir.
- `JOB-003` — job periódico: agendamento registrado no boot (`server.ts`) com intervalo documentado; one-shot declarado.
- `JOB-004` — logs de início/fim com métricas (`logger.info`) + `try/catch` com `logger.error` (string primeiro).
- `JOB-005` — Prisma direto é aceitável em seed/job mas **documentado** no topo (bypassa factory/validação/rules/policy);
  job não usa `getFactory()`.
- `JOB-006` — guard de produção (`process.env.NODE_ENV === 'production'`) no topo do seed; standalone, escopado a `userId`.
- `JOB-007` — resolver tabelas/pais por `internalName`/`id`, nunca por posição `[0]` (a ordenação da API difere do `findMany`).
- `JOB-008` — cobrir a variabilidade que a view ramifica (múltiplos status/scores, >1 registro-pai, datas passadas/futuras).

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à
mão; foram materializados na promoção a `validated` pelo skill-audit (SG-048).
