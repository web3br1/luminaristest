---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-ANALYTICS-KPI
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/analytics-kpi-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  AKPI-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  AKPI-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  AKPI-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  AKPI-004:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  AKPI-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `analytics-kpi-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `AKPI-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/analytics-kpi-generator/REPORT.md` |

Regras normativas da camada Analytics KPI, cada uma coberta por pelo menos um caso de eval comportamental:

- `AKPI-001` — single-pass sobre `rows`/stream retornando `ChartDataPoint[]` (assinatura `AnalyticsProcessor`); múltiplos passes = FAIL.
- `AKPI-002` — processor é função pura do `context`: sem `import React`, sem Express (`res.json`/`res.status`/`req`), sem `prisma.*` direto (DOMAIN-BOUNDARY backend-só-processor, não camada HTTP).
- `AKPI-003` — dinheiro acumulado como inteiro/centavos via `addMoney()`, nunca `+=` (drift de float).
- `AKPI-004` — `previousValue` é `undefined` (tipado `number | undefined`) quando não há período anterior, nunca `0`.
- `AKPI-005` — registro em `kpis/<category>/index.ts` via `registerProcessor` + `import` do template (auto-`registerTemplate`); KPI não-registrado é órfão.

Status `draft`: ainda **não validado** — sem `governance-eval-score`/`REPORT.md`. `eval-score`/`last-evaluated`
no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão; só aparecem quando a
skill for promovida a `validated` pelo `skill-audit`.
