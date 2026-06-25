---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-CRUD
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/crud-resource-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  CRUD-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  CRUD-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CRUD-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  CRUD-004:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  CRUD-005:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  CRUD-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `crud-resource-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `CRUD-*` inline no corpo) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/crud-resource-generator/REPORT.md` |

Regras normativas do slice CRUD, cada uma coberta por um caso de eval comportamental:

- `CRUD-001` — soft-delete em TODAS as camadas: `where: { deletedAt: null }` em todo find e delete via `update({ data: { deletedAt } })`, nunca `prisma.<model>.delete()`.
- `CRUD-002` — slice completo presente (`DTO → Repository → Policy → Service → Controller → Route` + frontend service); nenhuma camada faltando ou inlinada.
- `CRUD-003` — reuso dos canônicos (`GenericTable`/`StandardPagination`, `Modal`, `AnalyticsDashboard`/`ChartRenderer`/`DashboardKpiCard`) em vez de tabela/modal/analytics bespoke ("módulo ilha").
- `CRUD-004` — fronteira dura: nenhum serviço Prisma first-class injetado em `DynamicTableService`/`RuleContext`/`RulePlugin`; integração cross-módulo sobe ao controller/route (regressão do §2.1).
- `CRUD-005` — routing pelo teste §2.1: recurso com invariante financeiro/legal vai para Prisma first-class, nunca `dynamic-table`.
- `CRUD-006` — registro de rota em 3 toques, com destaque para `'/api/<resource>'` no `protectedApiPaths` de `middleware/auth.ts` (omissão = 401 silencioso).

`status: draft` — esta skill ainda NÃO foi validada; sem bloco de `score`/`governance-eval-score`
até o `skill-audit` gerar o `REPORT.md` correspondente (SG-011). `eval-score`/`last-evaluated` no
frontmatter da SKILL.md são **projeção** do `REPORT.md` — nunca editados à mão.
