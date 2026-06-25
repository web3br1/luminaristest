---
type: skill-governance
governance-skill-id: SKL-DT-PRESET
skill-path: ./SKILL.md
contract: ../_ARCHITECTURE-CONTRACT.md
last-evaluated: "2026-06-25"
status: validated
eval-score-source: ../skill-audit/reports/dynamic-table-preset-generator/REPORT.md   # projeção do relatório — NUNCA editar à mão
governs-rules:
  - AC-2.1-B2
  - AC-2.1-B3
  - AC-2.2-2
  - AC-2.2-3
gates:
  AC-2.1-B2:
    gate: luminaris-reviewer/fronteira-2.1
    kind: design-time
    note: entidade com invariante financeiro/legal nunca vira linha de preset
  AC-2.1-B3:
    gate: luminaris-reviewer/fronteira-2.1
    kind: design-time
    note: preset é UI/entrada, não persistência autoritativa de módulo ERP
  AC-2.2-2:
    gate: skill-audit/P6
    kind: design-time
    note: unique/compositeUnique de preset != constraint de DB (TOCTOU). Gêmeo de AC-2.1-B5.
  AC-2.2-3:
    gate: skill-audit/G5
    kind: executable
    command: "grep -rn \"targetTable: '@@PRESET_TABLE_KEY::\" server/src/features/dynamicTables/presets/modules/"
    expect: "nenhum preset referencia a própria tabela (self-relation == 0)"
---

# Governança — `dynamic-table-preset-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `_ARCHITECTURE-CONTRACT.md` §2.1/§2.2 (cada regra com ID estável) |
| Relação de **enforcement** (regra→gate) | este arquivo (`gates:` no frontmatter) |
| Coerência entre os dois | `skill-audit governance-check` |
| Navegação/visualização | Obsidian (este vault) |

Esta skill gera presets DynamicTable. Ela é responsável por **não** deixar um módulo com
invariante financeiro/legal cair no motor (metade §2.1-B: `AC-2.1-B2`, `AC-2.1-B3`) e por
respeitar os limites de plataforma (metade §2.2: `AC-2.2-2` unique≠constraint, `AC-2.2-3`
sem self-relation).

**`eval-score` é projeção** do `REPORT.md` do skill-audit — não há número materializado aqui
até o harness produzir um (`STALE_EVALUATION` compara `last-evaluated` com a última corrida do
relatório). `last-evaluated: 2026-06-24` reflete a auditoria §2.1 desta sessão, que achou e
corrigiu o isco "preset ERP" + adicionou o STOP §2.1 nesta skill.
