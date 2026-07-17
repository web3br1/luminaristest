---
type: skill-governance
governance-skill-id: SKL-WORKFLOW-TRANS
skill-path: ./SKILL.md
contract: ../_ARCHITECTURE-CONTRACT.md
last-evaluated: "2026-07-17"
status: draft   # DEMOVIDO de validated em 2026-07-17: o eval de AC-2.1-B4 aceitava 0/6 respostas corretas e aprovava 2/10 erradas — o 1.00 era verdadeiro e vazio. Núcleo da regra virou `judge:` (BLOCKED até julgamento model-in-loop). A skill não regrediu; o selo é que não era merecido. Promoção só pelo skill-audit (SG-048).
eval-score-source: ../skill-audit/reports/backend-workflow-transition-generator/REPORT.md   # projeção do relatório — NUNCA editar à mão
governs-rules:
  - AC-2.1-B1
  - AC-2.1-B4
gates:
  AC-2.1-B1:
    gate: skill-audit/G6
    kind: executable
    command: "grep -rn 'PostingService\\|PayrollService\\|FiscalService' server/src/features/dynamicTables/"
    expect: "vazio — nenhum serviço Prisma first-class injetado no motor/transição"
  AC-2.1-B4:
    gate: luminaris-reviewer/fronteira-2.1
    kind: design-time
    note: transição não edita DynamicTableService para integrar dois domínios
---

# Governança — `backend-workflow-transition-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `_ARCHITECTURE-CONTRACT.md` §2.1 (cada regra com ID estável) |
| Relação de **enforcement** (regra→gate) | este arquivo (`gates:` no frontmatter) |
| Coerência entre os dois | `skill-audit governance-check` |
| Navegação/visualização | Obsidian (este vault) |

Esta skill gera serviços de transição que orquestram DynamicTable atomicamente. O risco que ela
governa é a **injeção de serviço Prisma first-class na transição** (`AC-2.1-B1` → gate executável
G6) e a **edição do `DynamicTableService` para integrar domínios** (`AC-2.1-B4` → design-time no
reviewer).

**Prova do modelo:** `AC-2.1-B1` mapeia para `skill-audit/G6`, que **não existia** antes desta
sessão. Antes do fix, esta regra estaria órfã → `governance-check` reportaria `RULE_WITHOUT_GATE`
— exatamente o drift que deixou o §2.1-B sem trava por tempo indefinido. Agora fecha.
