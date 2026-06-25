---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-DOC-PROC
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: high
evaluation:
  report: ../skill-audit/reports/document-processing-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  DOCPROC-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  DOCPROC-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  DOCPROC-003:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  DOCPROC-004:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  DOCPROC-005:
    gates:
      - type: eval
        target: ./evals/evals.json#regression-1
  DOCPROC-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `document-processing-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `DOCPROC-*` inline no checklist) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/document-processing-generator/REPORT.md` |

Regras normativas do pipeline de ingestão documental (RAG), cada uma coberta por pelo menos um caso de eval comportamental:

- `DOCPROC-001` — extractor devolve `{ text: string }` (assinatura `extract<Type>(buffer): Promise<{ text: string }>`), erros via throw tipado.
- `DOCPROC-002` — chunking/embedding/Qdrant reusam as libs de `lib/vector/`; nunca reimplementar chunk/embed/upsert.
- `DOCPROC-003` — status flow em todos os branches (`PENDING→PROCESSING→COMPLETED|ERROR`), sem documento preso em `PROCESSING`; `processingDate`/`processingError` atualizados.
- `DOCPROC-004` — isolamento por tenant na busca RAG: ownership check por `userId` antes do Qdrant; `vectorRepository.search()` recebe `userId` + `docIds` do dono (anti-vazamento cross-tenant).
- `DOCPROC-005` — `DocumentPurpose` correto: `KNOWLEDGE_BASE` (PDF/DOCX) vs `DATA_ANALYSIS` (XLSX/CSV → `structured-data-generator`).
- `DOCPROC-006` — pipeline é camada de serviço pura: async, sem React/JSX, sem Express/HTTP no extractor/pipeline/service; buffer fora do banco.

Status `draft`: ainda **não validado** — sem `governance-eval-score`/`REPORT.md`. `eval-score`/`last-evaluated`
no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão; só aparecem quando a
skill for promovida a `validated`. `criticality: high` reflete o risco de isolamento de tenant (`DOCPROC-004`).
