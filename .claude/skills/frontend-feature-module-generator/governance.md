---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-FEATMOD
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-feature-module-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEMOD-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEMOD-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEMOD-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEMOD-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FEMOD-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-feature-module-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEMOD-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-feature-module-generator/REPORT.md` |

Regras normativas da camada Frontend Feature Module, cada uma coberta por ao menos um caso de eval comportamental:

- `FEMOD-001` — scaffold multi-arquivo: View principal (named export) + hook de dados separados; a View não declara fetch inline.
- `FEMOD-002` — barrel público `index.ts` re-exporta a View; o app importa pela API pública, não pelo caminho profundo.
- `FEMOD-003` — fronteira de camada: a View consome STATE via o hook e NÃO acessa dados (`apiClient`/`fetch`/`lib/services`); caso dedicado `regression-1`.
- `FEMOD-004` — acesso a dados vive no hook (service layer / `DynamicTableService`); caso dedicado `edge-1`.
- `FEMOD-005` — registro do dynamic import (`{ ssr: false }`) em `pages/dashboard/index.tsx` + switch do dashboard.

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` no frontmatter até existir `REPORT.md`. `governance-eval-score`/`governance-last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
