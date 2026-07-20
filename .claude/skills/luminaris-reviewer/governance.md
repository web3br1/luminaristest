---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-REVIEWER
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/luminaris-reviewer/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  REV-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  REV-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  REV-003:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  REV-004:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  REV-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  REV-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-2
  # Adicionada na v1.1.0 (choke point PAR-001 em slice de Fase A — cita _PARALLELIZATION-CONTRACT.md).
  # Eval estrutural em happy-3; execução comportamental model-in-loop (BLOCKED no CI).
  REV-007:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-3
---

# Governança — `luminaris-reviewer`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `REV-*` inline) |
| Relação **regra→gate** | este arquivo (`rules:`) |
| Coerência | `skill-audit governance-check` |
| Evidência | `evals/evals.json` + `../skill-audit/reports/luminaris-reviewer/REPORT.md` |

Agente **revisor** — papel: verificar de forma independente e reportar evidência. Os evals avaliam o **artefato** (o relatório de revisão), não código.

- `REV-001` — reporta PASS/FAIL com evidência (`arquivo:linha`); NÃO edita/corrige os arquivos sob revisão.
- `REV-002` — não aprova sem rodar o `tsc` (gate de compilação obrigatório).
- `REV-003` — evidência ausente / checks não executados ⇒ **BLOCKED/REPROVADO**, nunca PASS (não aprova na confiança).
- `REV-004` — defeito encontrado ⇒ devolve ao implementador com `arquivo:linha` + correção sugerida; não conserta em silêncio.
- `REV-005` — fronteira §2.1 (serviço Prisma first-class no motor DynamicTable) e veredicto de ilha (shape+posse) são FAIL-direto.
- `REV-006` — não aprova sem rodar o gate de wiring (`skill-audit.mjs wiring`) — registro central tsc-cego (rota/KPI/preset/i18n); `exit≠0` = FAIL.
- `REV-007` — **só em contexto de slice de Fase A** (lote paralelo, `_PARALLELIZATION-CONTRACT.md` PAR-003): o diff não pode tocar choke point PAR-001 (routes/index.ts, factory.ts, schema.prisma, seed.ts, openapi.json) — pertence à Fase B; interseção = FAIL. N/A em feature regular (2-toques normal). Gate: `happy-3`.

Status `validated`: avaliado em 2026-06-25 (score 1.00 — ver `REPORT.md`). `governance-eval-score`/
`governance-last-evaluated` no frontmatter são **projeção** do `REPORT.md` (SG-011); materializados na promoção (SG-048).
Regras pós-baseline (`REV-006`, e `REV-007` na v1.1.0) têm eval **estrutural** wired e gate coerente; a
cobertura **comportamental** foi **fechada em 2026-07-11** (corrida incremental fora do CI: `happy-3` PASS 5/5;
`happy-2` assertions PASS com nota — o prompt é hipotético e o revisor corretamente BLOQUEOU; ver `REPORT.md`).
Sem PASS comportamental forjado.
