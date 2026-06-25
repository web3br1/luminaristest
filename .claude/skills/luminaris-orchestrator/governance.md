---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-ORCHESTRATOR
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/luminaris-orchestrator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  ORCH-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  ORCH-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  ORCH-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  ORCH-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  ORCH-005:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `luminaris-orchestrator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `ORCH-*` inline) |
| Relação **regra→gate** | este arquivo (`rules:`) |
| Coerência | `skill-audit governance-check` |
| Evidência | `evals/evals.json` + `../skill-audit/reports/luminaris-orchestrator/REPORT.md` |

Agente de **orquestração** — papel: decompor, rotear e rastrear. Os evals avaliam o **artefato** (o PLANO), não código.

- `ORCH-001` — só planeja/roteia/rastreia; NÃO implementa (zero criação de arquivo) e NÃO aprova/promove.
- `ORCH-002` — roda o STEP 0 (gate §2.1) antes de rotear módulo novo (DynamicTable vs Prisma first-class).
- `ORCH-003` — NUNCA atribui implementação/revisão a si mesmo: delega ao `luminaris-implementer` e ao `luminaris-reviewer`.
- `ORCH-004` — o handoff carrega escopo + passos/skills + ordem/dependências + checks de validação + riscos.
- `ORCH-005` — não inventa skills (só as do SKILL_MATRIX); em ambiguidade, pergunta antes de planejar.

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter são **projeção** do `REPORT.md` (SG-011); materializados na promoção (SG-048).
