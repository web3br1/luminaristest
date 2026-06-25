---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-IMPLEMENTER
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/luminaris-implementer/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  IMPL-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  IMPL-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  IMPL-003:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  IMPL-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  IMPL-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  IMPL-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `luminaris-implementer`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `IMPL-*` inline) |
| Relação **regra→gate** | este arquivo (`rules:`) |
| Coerência | `skill-audit governance-check` |
| Evidência | `evals/evals.json` + `../skill-audit/reports/luminaris-implementer/REPORT.md` |

Agente **implementador** — papel: editar e validar. Os evals avaliam o **artefato** (o relatório de implementação), não código gerado.

- `IMPL-001` — executa o plano fielmente (lê a skill + refs antes); não decide o quê.
- `IMPL-002` — VERIFICA executando os checks de fato (`tsc`/`jest`) e reportando exit code real; nunca PASS sem rodar.
- `IMPL-003` — não avança se o `tsc` falhar (corrige e re-roda antes de seguir).
- `IMPL-004` — o handoff ao revisor carrega arquivos criados/editados + checks executados com exit codes + pendências/riscos.
- `IMPL-005` — não se auto-revisa nem promove o próprio resultado (entrega ao `luminaris-reviewer`; nunca declara APROVADO/validated).
- `IMPL-006` — não altera governança nem status de aprovação a menos que o plano peça explicitamente.

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter são **projeção** do `REPORT.md` (SG-011); materializados na promoção (SG-048).
