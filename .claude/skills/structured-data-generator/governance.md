---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-STRUCTURED-DATA
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/structured-data-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  SDATA-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SDATA-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  SDATA-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  SDATA-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  SDATA-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  SDATA-006:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  SDATA-007:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
---

# Governança — `structured-data-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `SDATA-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/structured-data-generator/REPORT.md` |

Regras normativas da camada Structured Data, cada uma coberta por pelo menos um caso de eval comportamental:

- `SDATA-001` — importar via lib de planilha (`xlsx`/`exceljs`); extractor devolve `{ sheets: SheetStructured[] }`, nunca parse de bytes na mão.
- `SDATA-002` — preservar o tipo de cada célula (`number`/`DATE`/`CURRENCY`/`PERCENTAGE`), nunca coagir a `string`; `null` (não `undefined`) para célula vazia.
- `SDATA-003` — persistir em SQL (JSON column) via `StructuredDataService`, nunca Qdrant; update só via `StructuredDataService.update()`, nunca `prisma` direto na coluna.
- `SDATA-004` — `DocumentPurpose.DATA_ANALYSIS` para tabular; `KNOWLEDGE_BASE` pula a extração estruturada.
- `SDATA-005` — DOMAIN-BOUNDARY: extractor/serviço é camada de servidor, zero React/JSX/hooks (o spreadsheet vive no frontend e só consome o shape).
- `SDATA-006` — novo `HeaderType` propaga nos 4 pontos casados (model enum + `ExcelHeader` + `inferColumnType` + `z.enum` do DTO).
- `SDATA-007` — normalizar single-sheet vs multi-sheet ao ler (`getByDocumentId()`); paginar grandes volumes.

Status `draft`: ainda **não validado** — sem `governance-eval-score`/`REPORT.md`. `eval-score`/`last-evaluated`
no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão; só aparecem quando a
skill for promovida a `validated` pelo skill-audit (SG-048).
