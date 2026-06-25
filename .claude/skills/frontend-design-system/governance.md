---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-DESIGN
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-design-system/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEDS-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEDS-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEDS-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEDS-004:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  FEDS-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEDS-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `frontend-design-system`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEDS-*` inline nas seções de tokens/tipografia/componentes) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-design-system/REPORT.md` |

Skill de conhecimento de apoio (SG-014 `user-invocable: false`): não é geradora standalone, mas ainda precisa de governança + evals (happy case que gera um componente pequeno aplicando o sistema). Estado `draft` — ainda não validada pelo skill-audit (SG-005/SG-048); sem `score`/`governance-eval-score` até existir REPORT.

Regras normativas da camada visual, cada uma coberta por um caso de eval comportamental:

- `FEDS-001` — superfície de card on-brand = `bg-white dark:bg-neutral-900`, nunca `zinc-*`.
- `FEDS-002` — cards usam `rounded-2xl`/`rounded-3xl` (não `rounded-xl`); inputs/botões/filtros podem usar `rounded-xl/lg`.
- `FEDS-003` — superfícies dark usam `neutral-*`/tokens, **zero** `zinc-*` (sinal nº1 de Tailwind genérico). Regressão conhecida: componente com `zinc-800` → caso `regression-1`.
- `FEDS-004` — `font-semibold` é corpo padrão; `font-black` só para ênfase (títulos/valores/labels uppercase).
- `FEDS-005` — componentes-assinatura do Galaxy theme (GradientHeader/ScoreGauge/StatusBadge/BantBars) reusados, não reinventados.
- `FEDS-006` — badges são `color/10` + `color/20` + `color-600`, nunca sólidos.

`eval-score`/`last-evaluated` são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
