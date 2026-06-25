---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-INTERVIEW-SETUP
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/interview-setup-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  INTV-001:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  INTV-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  INTV-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  INTV-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  INTV-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-2
  INTV-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-2
  INTV-007:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
---

# Governança — `interview-setup-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `INTV-*` inline no checklist/anti-patterns) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/interview-setup-generator/REPORT.md` |

Regras normativas da extensão do **wizard de onboarding AI** (máquina de estados `InterviewService` + `CustomizationService`
+ `FieldCustomizationService`), cada uma coberta por ao menos um caso de eval comportamental:

- `INTV-001` — serviços são singletons: acessar via `getInstance()`, nunca `new` (estado compartilhado).
- `INTV-002` — novo estágio entra na enum `InterviewStage`; se usa AI com history, **também** em `ProcessableStage`.
- `INTV-003` — config do estágio em `stageConfig: Record<ProcessableStage, IStageConfig>` (`systemPrompt`/`completionCheckPrompt`/`nextStage`),
  com um **marcador de conclusão** detectável no texto (`SUMMARY:`, `INDUSTRY_CONFIRMED:`); nunca `STAGE_PROMPTS: Record<…,string>` (shape obsoleto).
- `INTV-004` — handler no switch de `processTurn` lê `stageConfig[stage]`, chama `this.stageHandlers.getAiResponseWithHistory(config.systemPrompt, messages)`
  (ordem dos args), detecta o marcador e roteia `nextStage` (loop no próprio estágio vs. avança).
- `INTV-005` — customização via `StateManager` (Map in-memory por `sessionId`); não depender de persistência além da sessão ativa (MVP).
- `INTV-006` — `FieldCustomizationService` valida modificações com Zod (`FieldIntentParser`) e tenta o `FieldPresetMatcher` antes de criar campo custom.
- `INTV-007` — DOMAIN-BOUNDARY: o backend da máquina de estados é camada de servidor pura (zero React/JSX/hooks); a UI do wizard consome via service layer.

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — materializados na
promoção a `validated` pelo skill-audit (SG-048).
