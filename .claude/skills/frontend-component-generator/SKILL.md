---
name: frontend-component-generator
description: Gera React component funcional tipado com props interface, cobrindo Modals, Form fields e Cards seguindo o Galaxy theme
argument-hint: "[NomeDoComponente] [modal|form-field|card|default]"
allowed-tools: Read, Grep, Glob, Write, Edit
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

1. Props interface: `interface <Name>Props { ... }` no mesmo arquivo
2. FC: `export const <Name>: React.FC<<Name>Props> = ({ ... }) => { ... }`
3. **Estilização: aplicar a skill `frontend-design-system`** — tokens reais: superfícies `bg-white dark:bg-neutral-900` (NÃO `zinc`), borda dark `dark:border-neutral-800`, **cards** `rounded-2xl`, labels de seção `text-[10px] uppercase tracking-widest`, `font-black` em títulos/valores. `font-semibold` e `rounded-xl` são corretos para corpo/inputs/botões. Componentes-assinatura (gauge, BANT bars, gradient header, badges) para heros/detalhe.
4. Sempre incluir variantes dark mode: superfícies `dark:bg-neutral-900/800`, texto `dark:text-white`/`dark:text-gray-400`
5. Modal pattern: props `isOpen: boolean`, `onClose: () => void`, `onConfirm?: () => void`
6. Loading state: exibir `LoadingSpinner` quando `isLoading`
7. Empty state: mensagem descritiva quando sem dados

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
