---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FE-MODAL
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ../skill-audit/reports/frontend-modal-generator/REPORT.md
  last_evaluated: 2026-06-25
  score: 1.00
  minimum_score: 0.90
rules:
  FEMODAL-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEMODAL-002:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
      - type: eval
        target: ./evals/evals.json#regression-1
  FEMODAL-003:
    gates:
      - type: eval
        target: ./evals/evals.json#edge-1
  FEMODAL-004:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEMODAL-005:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
  FEMODAL-006:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança — `frontend-modal-generator`

| Camada | Fonte canônica |
|---|---|
| Texto das **regras** | `SKILL.md` (IDs `FEMODAL-*` inline no Generation contract) |
| Relação **regra→gate** | este arquivo (`rules:` no frontmatter) |
| Coerência | `skill-audit governance-check` |
| Evidência de execução | `evals/evals.json` + `../skill-audit/reports/frontend-modal-generator/REPORT.md` |

Regras normativas da camada Frontend Modal, cada uma coberta por um caso de eval comportamental:

- `FEMODAL-001` — construído sobre o primitivo canônico `components/ui/Modal.tsx` (import + `<Modal>`); nunca um dialog/overlay bespoke.
- `FEMODAL-002` — padrão modal-não-rota: estado `selected` na view-pai + `isOpen`/`onClose`; sem `router.push` para página de detalhe; caso dedicado `regression-1`.
- `FEMODAL-003` — reuse dos modais existentes (`ConfirmDeleteModal`/`ConfirmModal` em `confirm`); não recria confirmação; caso dedicado `edge-1`.
- `FEMODAL-004` — escritas via service layer (`lib/services/*.service.ts`), nunca `fetch`/`apiClient` direto.
- `FEMODAL-005` — props tipadas sem `any` (`interface <Name>Props`).
- `FEMODAL-006` — Galaxy theme: `neutral-*` (nunca `zinc-*`), `rounded-2xl`/`3xl`, dark, `font-black`.

`status: draft` — esta skill ainda não foi promovida a `validated` pelo skill-audit; sem `score`/`eval-score` até existir `REPORT.md`. `eval-score`/`last-evaluated` no frontmatter da skill são **projeção** do `REPORT.md` (SG-011) — nunca editados à mão.
