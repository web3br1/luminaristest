---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-CONTEXT
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-context-provider-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FECTX-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FECTX-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FECTX-003:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FECTX-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#edge-1
  FECTX-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-context-provider-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FECTX-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-context-provider-generator/REPORT.md` |

Regras normativas da camada Frontend Context, cada uma coberta por um caso de eval comportamental:

- `FECTX-001` — Context tipado via `createContext<...Type | undefined>(undefined)` (import de `react`).
- `FECTX-002` — Provider exportado que envolve `children` com `<...Context.Provider>`.
- `FECTX-003` — hook de consumo `use<Name>()` que lê via `useContext`.
- `FECTX-004` — o hook lança erro quando usado fora do Provider (`if (!ctx) throw ...`); caso dedicado `edge-1`.
- `FECTX-005` — `value` memoizado com `useMemo` (evita re-render de todos os consumidores).

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
