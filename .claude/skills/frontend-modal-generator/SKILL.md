---
name: frontend-modal-generator
description: Gera modais (detalhe/edição/confirmação/captura) sempre ancorados no primitivo canônico `my-app/components/ui/Modal.tsx` — nunca um dialog bespoke. Garante o padrão modal-não-rota (ver/editar um registro abre modal com estado local na view-pai, sem `router.push` de detalhe), reusa os modais existentes (`ConfirmDeleteModal`/`ConfirmModal`/`Lead360Modal`/`ProposalCaptureModal`), props tipadas sem `any` e o Galaxy theme. Use ao criar `<Name>Modal.tsx` em `my-app/features/<module>/components/`, ao trocar uma rota de detalhe por modal, ou ao adicionar confirmação/captura de input. Domínio/arquivos: `my-app/features/<module>/components/<Name>Modal.tsx` + view-pai + locales.
argument-hint: "[NomeDoModal] [detail|edit|confirm|capture]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (my-app/ com React + Next.js Pages Router + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-MODAL"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Frontend Modal Generator

## Purpose

Gera **modais** corretos no padrão do Luminaris, sempre ancorados no primitivo canônico `components/ui/Modal.tsx` (portal + focus-trap + esc + click-outside + `isDirty`/`themeColor`). Cobre os quatro tipos reais do app: **detalhe** de registro, **edição** de registro, **confirmação** (delete/ação destrutiva) e **captura** (coletar input antes de uma ação, ex.: valor da proposta). Garante a regra **modal-não-rota**: ver/editar um registro abre um modal com estado local na view — **nunca** `router.push` para uma página de detalhe.

> **Por que esta skill existe:** o detalhe de lead do CRM trocava de tela (`router.push('/crm/leads/[id]')`) em vez de abrir um modal. A remediação (Fase 2) trocou por `Lead360Modal` + `ProposalCaptureModal` sobre `Modal.tsx`. Esta skill encoda o padrão para qualquer modal novo.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos §0, **modal-não-rota** §3, service layer, `useMemo`, no-`any`, design system §4, i18n) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Modal**. Para o detalhe de um card de board use junto `frontend-kanban-workflow-generator` (que já abre `KanbanCardDetailModal`); para a tela de lista use `frontend-table-screen-generator` (cujo CRUD já traz os modais de create/edit/confirm do stack canônico).

## When to use

- Detalhe de um registro (abrir em modal, não em rota)
- Edição de um registro fora do `RowActionsCell` (formulário em modal)
- Confirmação de ação destrutiva (delete / inativar)
- Captura de input antes de uma ação (valor, motivo, data — ex.: etapa "proposta")

## Inputs

- `$ARGUMENTS[0]`: nome do modal em PascalCase (ex: `Lead360Modal`, `ProposalCaptureModal`)
- `$ARGUMENTS[1]`: tipo: `detail` | `edit` | `confirm` | `capture`

## Repository patterns to inspect first

```
my-app/components/ui/Modal.tsx                                                        ← primitivo canônico (REUSE — base de todo modal)
my-app/features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx  ← detalhe/edição de um registro em modal (estado local)
my-app/features/dashboard/shared/components/ConfirmDeleteModal.tsx                    ← confirmação de ação destrutiva (sobre ConfirmModal)
my-app/components/ui/feedback/                                                        ← ConfirmModal/useConfirmModal/Toast/Alert
my-app/features/crm/components/Lead360Modal.tsx                                       ← detalhe rico (golden ref verificada)
my-app/features/crm/components/ProposalCaptureModal.tsx                               ← captura de input (golden ref verificada)
my-app/pages/crm/leads/[id].tsx                                                       ← rota deep-link OPCIONAL (não é o caminho de "ver da lista")
```

## ⭐ Exemplo de referência canônico (espelhe estes arquivos)

- `my-app/components/ui/Modal.tsx` — o primitivo: props `{ isOpen, onClose, title?, children, maxWidth?='max-w-md', showCloseButton?, footer?, headerActions?, isDirty?, themeColor?='bg-blue-600' }`. Portal para `document.body`, focus-trap, esc, click-outside, confirm de mudanças não-salvas. **Todo modal novo é construído sobre ele.**
- `my-app/features/crm/components/Lead360Modal.tsx` — **golden ref verificada** de detalhe rico (header/score/badges/seções + ação "avançar etapa" → service). Estado `selected`/`isOpen` vive na view-pai.
- `my-app/features/crm/components/ProposalCaptureModal.tsx` — **golden ref verificada** de captura (coleta `amount`/`currency`/`winProbability` antes de chamar a transição; cancelar = nenhuma ação).
- `ConfirmDeleteModal.tsx` — padrão de confirmação destrutiva (variant danger, soft-delete).

## Generation contract

Cada item marcado `[FEMODAL-*]` abaixo é uma REGRA DE GERAÇÃO auditável (ancora no primitivo canônico `components/ui/Modal.tsx` e nos golden refs verificados — `Lead360Modal`/`ProposalCaptureModal`/`ConfirmDeleteModal`). Gere já em conformidade.

1. **[FEMODAL-001]** **Sobre o primitivo canônico `Modal.tsx` — nunca um dialog bespoke** — `export function <Name>({ isOpen, onClose, ... }: <Name>Props)` que importa `Modal` de `components/ui/Modal` e renderiza `<Modal isOpen onClose title maxWidth themeColor>…children…</Modal>`. **NUNCA** reimplemente portal/overlay/esc/focus-trap/click-outside — o primitivo já faz; um `<div>` overlay próprio é proibido.
2. **[FEMODAL-002]** **Modal-não-rota:** o pai controla `const [selected, setSelected] = useState<T | null>(null)` e passa `isOpen={!!selected}` + `onClose={() => setSelected(null)}`. O clique que abre o detalhe/edição **substitui** qualquer `router.push` de página de detalhe — ver/editar é modal, jamais navegação.
3. **[FEMODAL-003]** **Reuse os modais existentes — não recrie:** por tipo —
   - `detail`: renderiza o conteúdo do registro (reuse componentes-assinatura: `GradientHeader`/`ScoreGauge`/`StatusBadge`/badges). Ações (ex.: avançar etapa) chamam o **service layer** e disparam `onChanged?()` para o pai refazer fetch.
   - `edit`: formulário (reuse `DynamicForm` quando for DynamicTable) → `updateRecord`; `isDirty` no `Modal` para confirmar descarte.
   - `confirm`: **reuse `ConfirmDeleteModal`/`ConfirmModal` (não recrie)** — `onConfirm` + estado `isDeleting`/`error`; destrutivo = variant danger.
   - `capture`: campos controlados mínimos → `onConfirm(payload)`; `onCancel`/`onClose` = nenhuma ação (rollback no pai se já houve update otimista).
4. **[FEMODAL-004]** **Service layer:** ações de escrita vão por `lib/services/*.service.ts` — nunca `fetch`/`apiClient` direto no modal.
5. **[FEMODAL-005]** **Props tipadas sem `any`** — `interface <Name>Props { isOpen: boolean; onClose: () => void; ... }`; loading/error tratados; i18n (`t()` no namespace do módulo, nada hardcoded).
6. **[FEMODAL-006]** **Galaxy theme:** `neutral-*` (**nunca** `zinc-*`), cards `rounded-2xl`/`3xl`, dark, `font-black` em títulos/valores.

## Checklist obrigatório — Modal

- [ ] Construído sobre `components/ui/Modal.tsx` — **zero** portal/overlay/esc/focus-trap reimplementado
- [ ] Detalhe/edição abre **modal** com estado local na view-pai — **nunca** `router.push` para página de detalhe
- [ ] `isOpen`/`onClose` controlados pelo pai; `onChanged?`/`onConfirm?` para propagar resultado
- [ ] `confirm` reusa `ConfirmDeleteModal`/`ConfirmModal` (não recria); destrutivo = variant danger
- [ ] `capture` coleta input ANTES da ação; cancelar não dispara escrita (rollback no pai se otimista)
- [ ] Escritas via service layer; props sem `any`; loading/error tratados
- [ ] `neutral`/`rounded-2xl`/dark; i18n via `t()`; zero `zinc-*`

## Files usually created or changed

```
my-app/features/<module>/components/<Name>Modal.tsx   ← NEW (sobre Modal.tsx)
my-app/features/<module>/...<ParentView>.tsx          ← EDIT (estado selected + render do modal; remover router.push de detalhe)
my-app/public/locales/{en,pt}/<namespace>.json        ← EDIT (labels do modal)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```
Verificação visual (contrato §6): abrir o modal não troca de rota; ação dispara o service e o pai atualiza; cancelar não escreve.

## Anti-patterns

- **Não troque de rota para ver/editar um registro** — detalhe/edição é modal. Reserve `pages/<x>/[id].tsx` só como deep-link opcional.
- **Não reimplemente o primitivo** (portal/overlay/esc/focus-trap) — use `Modal.tsx`.
- **Não recrie confirmação** — reuse `ConfirmDeleteModal`/`ConfirmModal`.
- **Não chame `fetch`/`apiClient` direto** no modal — use o service layer.
- **Não escreva no cancelar** de um `capture` — cancelar deve reverter (rollback no pai), não persistir.
