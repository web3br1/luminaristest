---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-PAGE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-page-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEPAGE-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEPAGE-002:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  FEPAGE-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEPAGE-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEPAGE-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEPAGE-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEPAGE-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-page-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEPAGE-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-page-generator/REPORT.md` |

Regras normativas da camada Frontend Page, cada uma coberta por um caso de eval comportamental:

- `FEPAGE-001` — a página COMPÕE a View do módulo de feature (dynamic import da `<Name>View`) e NÃO duplica: sem fetch, sem `apiClient`/`lib/services`, sem `export function use<...>` na página; caso dedicado `regression-1`.
- `FEPAGE-002` — Pages Router em `pages/<resource>/index.tsx`; detalhe = modal, não `[id].tsx`; caso dedicado `edge-1`.
- `FEPAGE-003` — auth guard `withAuth` (ou `useAuth()` + redirect).
- `FEPAGE-004` — i18n via `serverSideTranslations` dentro de `getServerSideProps`.
- `FEPAGE-005` — dynamic imports `{ ssr: false }` para a View e libs pesadas, fora do `_app`.
- `FEPAGE-006` — container full-height do shell (sem `max-w-*` divergente) + design system (`neutral-*`, nunca `zinc-*`).
- `FEPAGE-007` — dados derivados memoizados (`useMemo`).

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
