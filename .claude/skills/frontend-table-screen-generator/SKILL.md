---
name: frontend-table-screen-generator
description: Gera tela de listagem/tabela de registros reusando o stack canônico GenericTabbedView (CRUD inline, filtros, paginação, soft-delete) — em vez de uma tabela bespoke sem botões/widgets
argument-hint: "[nome-do-modulo] [internalName-da-tabela]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Frontend Table Screen Generator

## Purpose

Gera uma **tela de listagem de registros** (lista/tabela de uma DynamicTable) que **REUSA o stack canônico** `GenericTabbedView` → `GenericTable`/`GenericRow`/`RowActionsCell` + `GenericFilterBar` + `StandardPagination`. Garante que a tela já venha com os **widgets e botões corretos**: criar (`FloatingActionButton` → `createRecord`), editar (`EditRecordButton` → `updateRecord`), excluir (soft-delete via `ConfirmDeleteModal` → `deleteRecord`), filtros, ordenação, paginação (25/pg) e resolução de campos de relação. É a skill correta para qualquer "tabela de X" / "listagem de Y" / "grid de registros".

> **Por que esta skill existe:** as tabelas do CRM (`RecordTable.tsx`) eram bespoke — **sem add/edit/delete na linha, sem filtros, sem paginação**, estilo fora do padrão. A remediação (Fase 1) substituiu por um wrapper que reusa `GenericTabbedView` (`CrmTableScreen.tsx`). Esta skill impede que o próximo gerador reincida no "módulo ilha".

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (reuse de canônicos §0, service layer, paginação DynamicTable/fetch-all §3, container full-height, design system §4, i18n) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Table Screen**. Para detalhe/edição em modal use junto `frontend-modal-generator`; para board por etapa use `frontend-kanban-workflow-generator`.

## When to use

- "tabela de X", "listagem de Y", "grid de registros", "tela de cadastros"
- Qualquer entidade DynamicTable que precise de CRUD inline + filtros + paginação
- Substituir uma tabela estática/read-only (`<table>` bespoke) por uma tela canônica

## Inputs

- `$ARGUMENTS[0]`: nome do módulo em kebab-case (ex: `contacts`, `accounts`)
- `$ARGUMENTS[1]`: `internalName` da DynamicTable (preset key, ex: `crmContacts`, `leadProposals`)

## Repository patterns to inspect first

```
my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx              ← wrapper canônico (REUSE — não recrie)
my-app/features/dashboard/category-views/shared/components/GenericTable.tsx        ← tabela (colunas/sort/resize)
my-app/features/dashboard/category-views/shared/components/GenericRow.tsx          ← linha por tipo de campo
my-app/features/dashboard/category-views/shared/components/RowActionsCell.tsx      ← edit/delete inline
my-app/features/dashboard/category-views/shared/components/GenericFilterBar.tsx    ← filtros (busca + enum/boolean)
my-app/features/dashboard/shared/components/StandardPagination.tsx                 ← paginação (25/pg)
my-app/features/dashboard/components/shared/FloatingActionButton.tsx               ← criar (modal + createRecord)
my-app/features/dashboard/components/shared/EditRecordButton.tsx                   ← editar (modal + updateRecord)
my-app/features/dashboard/shared/components/ConfirmDeleteModal.tsx                 ← excluir (soft-delete)
my-app/features/dashboard/components/shared/dynamic-tables.client.ts               ← IDynamicTable/ITableSchema + useTableData (fetch-all)
my-app/lib/services/dynamic-table.service.ts                                       ← getTables/createRecord/updateRecord/deleteRecord
my-app/features/crm/components/RecordTable.tsx (DELETADO)                          ← ⚠️ ANTI-EXEMPLO histórico (tabela sem widgets)
```

## ⭐ Exemplo de referência canônico (espelhe estes arquivos)

- `my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx` — o wrapper que já orquestra dados + filtro + sort + paginação + create/edit/delete + relation lookups. **Leia-o ANTES de gerar.**
- `my-app/features/crm/components/CrmTableScreen.tsx` — **golden reference verificada** (revisada por multi-agente, em produção): resolve a `IDynamicTable` por `internalName` (com fallback de nome, nunca `[0]`), trata loading/error/não-instalada, e delega tudo a `<GenericTabbedView tables={[table]} … />`.

**NUNCA** espelhe `RecordTable.tsx` (era o board estático/read-only que esta skill substitui).

## Generation contract

1. **Wrapper component** `my-app/features/<module>/components/<Name>TableScreen.tsx` — `export function <Name>TableScreen({ internalName, titleKey, descriptionKey })`:
   - Resolve a `IDynamicTable` (com schema) por `internalName` via `DynamicTableService.getTables()` → `tables.find(x => x.internalName === internalName || x.name === '<Human Name>')` (mantém `internalName` como chave primária; **nunca** `[0]`). `useMemo` na resolução.
   - Estados: loading, error, e **não-instalada** (tabela ausente → mensagem on-brand, não crash).
   - Renderiza `<GenericTabbedView tables={[table]} title={t(titleKey)} description={t(descriptionKey)} />`. NÃO escreva `<table>` próprio — todo o CRUD/filtros/paginação/relation-lookups vêm do `GenericTabbedView`.
2. **Página** `my-app/pages/<module>/<name>.tsx` — `<CrmLayout/Shell><…TableScreen/></Shell>` (ou o shell do módulo). `withAuth` + `getServerSideProps`.
3. **i18n (lição crítica):** o `GenericTabbedView` usa o namespace **`database`** (cabeçalhos de coluna, filtros, sort, nome da aba = `t('database:fields.*')`, `t('database:tables.*')`). A página DEVE carregar `serverSideTranslations(locale, ['common', '<namespace>', 'database'])` — **sem `database`, usuários não-EN veem cabeçalhos/filtros em inglês** (bug silencioso que o `tsc` não pega).
4. **CRUD vem de graça** do stack — não recodifique: criar = `FloatingActionButton` (modal `DynamicForm` → `createRecord`); editar = `EditRecordButton` via `RowActionsCell` (→ `updateRecord`); excluir = `ConfirmDeleteModal` (soft-delete → `deleteRecord`).
5. **Leitura paginada (fetch-all):** o `useTableData` canônico já busca todas as páginas (limit=200 até `totalPages`). Validar com **>50 registros** (sem isso a lista truncava em 50).
6. Design system: `neutral`, cards `rounded-2xl`, dark mode; container full-height herdado do shell (sem `max-w-*`).

## Checklist obrigatório — Table Screen

- [ ] Reusa `GenericTabbedView` (que traz `GenericTable`/`RowActionsCell`/`GenericFilterBar`/`StandardPagination`) — **zero** `<table>` bespoke
- [ ] Resolve a `IDynamicTable` por `internalName` (com fallback de nome), **nunca** `[0]`; `useMemo`
- [ ] Estados loading / error / **tabela-não-instalada** tratados
- [ ] Create (`FloatingActionButton`→`createRecord`), edit (`EditRecordButton`→`updateRecord`), delete (`ConfirmDeleteModal` soft→`deleteRecord`) funcionando
- [ ] Filtros (`GenericFilterBar`) + paginação (`StandardPagination`, 25/pg); validar com **>50 registros**
- [ ] Página carrega o namespace **`database`** em `serverSideTranslations` (além de `common` + o do módulo)
- [ ] `neutral`/`rounded-2xl`/dark; container full-height (sem `max-w-*`); zero `zinc-*`

## Files usually created or changed

```
my-app/features/<module>/components/<Name>TableScreen.tsx   ← NEW (wrapper sobre GenericTabbedView)
my-app/pages/<module>/<name>.tsx                            ← NEW/EDIT (shell + screen + 'database' namespace)
my-app/public/locales/{en,pt}/<namespace>.json             ← EDIT (title/subtitle keys)
```

## Required checks

```bash
cd my-app && npx tsc --noEmit
```
Verificação visual (contrato §6): add/edit/delete na linha funcionando, filtros, paginação com **>50 registros**, estilo idêntico às tabelas do dashboard.

## Anti-patterns

- **Não construa um `<table>` bespoke** sem ações inline/filtros/paginação — foi o erro de `RecordTable.tsx`. Reuse `GenericTabbedView`.
- **Não resolva a tabela por índice `[0]`** — a ordem da API varia; use `internalName`.
- **Não esqueça o namespace `database`** no `serverSideTranslations` — senão cabeçalhos/filtros caem em inglês para outros locales.
- **Não pagine só a primeira página** — `useTableData` busca tudo; nunca volte a um `getTableData` de página única.
- **Não fixe `max-w-*`** na tela — herde o container full-height do shell.
