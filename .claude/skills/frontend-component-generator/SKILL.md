---
name: frontend-component-generator
description: Gera componente React funcional tipado (`export const <Name>: React.FC<<Name>Props>`) com interface de props no mesmo arquivo, em my-app/components/ ou features/, seguindo o Galaxy theme do Luminaris (tokens `neutral-*`, cards `rounded-2xl`, dark mode). Cobre cards, form fields, modals simples e componentes folha de UI. Use quando o pedido for "crie um componente/card/form field React", ao precisar de uma peça de UI reutilizável tipada — NÃO para tela de tabela (use frontend-table-screen-generator), modal canônico (frontend-modal-generator) nem board Kanban (frontend-kanban-workflow-generator). Domínio/arquivos: my-app/components/<category>/<Name>.tsx (.tsx React/Next.js Pages Router).
argument-hint: "[NomeDoComponente] [modal|form-field|card|default]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (my-app/ com React + Next.js Pages Router + Tailwind + tsc). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-FE-COMPONENT"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Frontend Component Generator

## Purpose

Gera componentes React funcionais tipados em `my-app/components/` ou dentro de `features/`, seguindo o Galaxy theme do Luminaris com Tailwind CSS. Cobre modals, form fields, cards e componentes genéricos.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos, service layer, paginação DynamicTable, modal-não-rota, `useMemo`, no-`any`, container full-height, design system) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Component**.

> **Decisão bespoke-vs-canônico (anti-ilha):** antes de criar um componente próprio, responda `.claude/skills/_REUSE-CRITERION.md` (shape+posse) — mesmo shape+fonte de um canônico vivo (§0) = **reuse**; diverge em shape ou posse = bespoke sancionado. É o único gate de reuso que o lint não pega.

> **Delegue quando for uma peça canônica inteira (não recrie aqui):**
> - **Tela de tabela/listagem de registros** (CRUD inline + filtros + paginação) → use `frontend-table-screen-generator` (reusa `GenericTabbedView`). Esta skill cobre só componentes pequenos/folha.
> - **Modal** (detalhe/edição/confirmação/captura) → use `frontend-modal-generator` (ancorado em `Modal.tsx`, regra modal-não-rota).
> - **Board por etapa (Kanban/workflow)** → use `frontend-kanban-workflow-generator`.
> Use esta skill para cards, form fields e componentes genéricos de UI.

## When to use

- Novo componente de UI reutilizável
- Modal para ação (criar/editar/confirmar)
- Form field customizado
- Card de listagem com dados

## Inputs

- `$ARGUMENTS[0]`: nome do componente em PascalCase (ex: `AppointmentCard`)
- `$ARGUMENTS[1]`: tipo: `modal` | `form-field` | `card` | `default`

## Repository patterns to inspect first

```
my-app/components/ui/GalaxyCard.tsx
my-app/components/ui/Modal.tsx
my-app/components/ui/feedback/
my-app/tailwind.config.js
my-app/features/dashboard/category-views/shared/components/GenericTable.tsx   ← tabela canônica de registros (NÃO recrie)
my-app/features/dashboard/category-views/shared/components/RowActionsCell.tsx ← edit/delete inline canônico
my-app/features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx ← detalhe de registro em MODAL
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

Por tipo de componente:
- **Modal/detalhe de registro** → `my-app/components/ui/Modal.tsx` (portal + `isOpen`/`onClose`) como base, e `my-app/features/dashboard/category-views/kanban/components/KanbanCardDetailModal.tsx` como padrão de detalhe/edição de um registro em modal (estado local na view, não rota).
- **Tabela de registros** → NÃO escreva `<table>`: reuse `my-app/features/dashboard/category-views/shared/components/GenericTable.tsx` + `RowActionsCell.tsx` (CRUD inline, filtros, sort, soft-delete).

Leia o arquivo correspondente ANTES de gerar. (Para tabela/modal: NUNCA espelhe os equivalentes do CRM — `RecordTable.tsx` é o anti-exemplo, reprovado por não ter add/edit/delete na linha nem paginação.)

## Reuse antes de criar (lição da revisão do CRM)

Antes de gerar um componente, verifique se o app já tem o canônico e **reuse-o** — criar paralelos bespoke deixa o módulo fora do padrão:
- **Lista tabular de registros de DynamicTable** → NÃO escreva um `<table>` próprio. Reuse `GenericTable` + `GenericRow` + `RowActionsCell` (CRUD inline, filtros, sort, soft-delete, colunas customizáveis), orquestrados por `GenericTabbedView`. "Card de listagem" (abaixo) é só para coleções que genuinamente não são tabela.
- **Detalhe/edição de um registro** → MODAL (`Modal.tsx` via portal + estado local na view, padrão `KanbanCardDetailModal`), NÃO uma página/rota separada.

## Generation contract

Cada item marcado `[FECOMP-*]` abaixo é uma REGRA DE GERAÇÃO auditável (espelha os componentes canônicos de UI do Luminaris — `GalaxyCard`, `Modal`, `feedback/*`). Gere já em conformidade.

1. **[FECOMP-001]** Props interface tipada `interface <Name>Props { ... }` no mesmo arquivo — sem ela o componente não é seguro, e **zero `any`** nos tipos de props.
2. **[FECOMP-002]** Componente funcional exportado: `export const <Name>: React.FC<<Name>Props> = ({ ... }) => { ... }` (function component, nunca class component).
3. **[FECOMP-003]** **Galaxy theme tokens — superfícies dark com `neutral-*`, NUNCA `zinc-*`** (único sinal confiável de Tailwind genérico/off-brand): superfícies `bg-white dark:bg-neutral-900`, borda dark `dark:border-neutral-800`, **cards** `rounded-2xl`, labels de seção `text-[10px] uppercase tracking-widest`, `font-black` em títulos/valores. `font-semibold`/`rounded-xl` são corretos para corpo/inputs/botões. Aplicar a skill `frontend-design-system`.
4. **[FECOMP-004]** Sempre incluir variantes dark mode: superfícies `dark:bg-neutral-900/800`, texto `dark:text-white`/`dark:text-gray-400`.
5. **[FECOMP-005]** **Tipo `modal`** — props `isOpen: boolean`, `onClose: () => void`, `onConfirm?: () => void` (modal simples/folha; para modal canônico ancorado em `Modal.tsx` delegue a `frontend-modal-generator`).
6. **[FECOMP-006]** **Tipo `form-field`/`card` com dados** — loading state via `LoadingSpinner` quando `isLoading`, e empty state com mensagem descritiva quando sem dados.
7. **Estilização inline proibida** — sempre Tailwind classes, nunca `style={{}}`.

## Files usually created or changed

```
my-app/components/<category>/<Name>.tsx    ← NEW
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```

## Anti-patterns

- Não use `style={{}}` inline — sempre Tailwind classes
- Não esqueça dark mode: sempre incluir variantes `dark:`
- **Não use `zinc-*` para superfícies dark** — o app usa `neutral-*` (único sinal confiável de Tailwind genérico). Cards devem ser `rounded-2xl` (não `rounded-xl`), mas `rounded-xl`/`font-semibold` são corretos em inputs/botões/corpo — não os trate como off-brand. Ver `frontend-design-system`.
- Não omita a interface de props — sem tipos o componente não é seguro
- Não use `any` nos tipos de props
- **Não construa uma tabela de registros do zero** (`<table>` bespoke sem ações inline/filtros/paginação) — reuse `GenericTable`/`RowActionsCell`. Foi o erro do CRM (`RecordTable.tsx`): tabela sem add/edit/delete na linha, sem filtros, sem paginação.
- **Não use modal só para "ação"** e rota para detalhe — detalhe de registro também é modal. O projeto prefere modal sobre troca de rota.
