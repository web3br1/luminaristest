# Parte B / P0 — Slice 5: Saved Views (backend-shared) + Bulk actions (#5)

> SDD spec. List views salvas por usuário (cross-device) + ações em massa (bulk delete) no stack de tabela canônico. **Features opt-in** (default off) → ligadas só no `CrmTableScreen`; zero impacto nas demais tabelas (finance/dashboard/widgets). Decisão do usuário: backend-shared (completo).

## Verificado (ground-truth)
- Estado de uma "view" no `GenericTabbedView`: `query: string`, `fieldFilters: Record<string,string>`, `sortConfig: SortOption|null` ({field,direction}). (Config de COLUNAS vive em `useTableColumnControls`/localStorage — **fora da saved view v1**; documentar; o `config` Json é flexível p/ incluir depois.)
- Persistência hoje: localStorage (`useTableColumnControls`, `useFilterPersistence`). **Não há** store de view no backend. `DashboardLayout` é o exemplar de per-user store (model+CRUD+factory) — espelhar o padrão.
- Bulk delete: só single (`DynamicTableService.deleteTableData(user,dataId)` / `DELETE /:tableId/data/:dataId`). Sem batch.
- `GenericTabbedView` consumido por 5 callers; `isWidgetMode` já gateia UI. Novas features atrás de `enableSavedViews`/`enableBulkActions` (default false).

## Backend — A. Saved views (feature slice nova `server/src/features/savedViews/`)
- **Prisma** `SavedTableView`:
  ```prisma
  model SavedTableView {
    id        String   @id @default(cuid())
    userId    String
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    tableId   String   // IDynamicTable.id (escopo da view; não FK — tabelas são dinâmicas)
    name      String
    config    Json     // { query, fieldFilters, sortConfig }
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    deletedAt DateTime?
    @@index([userId, tableId])
    @@map("saved_table_views")
  }
  ```
  + back-relation `savedTableViews SavedTableView[]` em `User`. Migration additive (eu aplico via migrate deploy).
- **Slice** (espelhar `users`/`dashboardLayout`): model `ISavedTableView`; dto `SavedTableViewDto` (CreateSchema: tableId, name, config object [z.object com query/fieldFilters/sortConfig opcionais, sem z.any() — usar z.record(z.string()) p/ fieldFilters, z.object p/ sortConfig nullable]; UpdateSchema .partial()); repository (create, findManyByUserTable(userId,tableId) [deletedAt:null], findById, update, softDelete) prisma-only, Prisma types de 'generated/prisma'; policy (canView/canUpdate/canDelete(actor,ownerId)=ADMIN||actor.id===ownerId); service (policy-first; cross-tenant=NotFoundError; create scoped a actor.id).
- **Controller** `savedViewsController.ts` + **rota** `routes/saved-views.ts` `GET /?tableId=` (lista do user), `POST /`, `PATCH /:id`, `DELETE /:id` — 3 toques (mount `/api/saved-views` em routes/index.ts + `protectedApiPaths` em middleware/auth.ts + `@openapi` em docs.paths.ts). Factory: getSavedTableViewService().

## Backend — B. Bulk delete (estende dynamicTables)
- `DynamicTableService.deleteTableDataBatch(user, tableId, ids: string[])`: dentro de `runInTransaction`, para cada id chamar a lógica de delete existente (resolve tabela do dataId, policy canManageData, soft-delete `{ tx }`); validar que cada row pertence à `tableId` do user; cap em ~200 ids. Retorna `{ deleted: n }`. Reusar caminhos existentes; sem `prisma.*` cru novo.
- Rota `POST /:tableId/data/batch-delete` (body `{ ids: z.array(z.string().cuid()).min(1).max(200) }`) em `routes/dynamic-tables.ts` + handler no `dynamicTablesController` (safeParse + getUserContextFromRequest + handleApiError) + `@openapi`. `/api/dynamic-tables` já protegido.

## Frontend — `my-app`
- **services** `lib/services/savedView.service.ts`: `listViews(tableId)`, `createView({tableId,name,config})`, `updateView(id,patch)`, `deleteView(id)` (apiClient, tipados, sem any). `lib/services/dynamic-table.service.ts`: `deleteRecordsBatch(tableId, ids): Promise<{deleted:number}>` → POST batch-delete.
- **hook** `features/dashboard/category-views/shared/hooks/useTableViews.ts`: `useTableViews(tableId, enabled)`: lista (backend), `saveView(name, viewState)`, `applyView(id)→viewState`, `deleteView(id)`; SSR-safe; só busca quando `enabled`.
- **GenericTabbedView** (opt-in, additive): props `enableSavedViews?: boolean` + `enableBulkActions?: boolean` (default false).
  - Saved views: quando `enableSavedViews`, render `SavedViewsMenu` (selecionar view → set query/fieldFilters/sortConfig + reset page; "Salvar como" captura o estado atual; excluir). Reusa os setters existentes. Sem alterar comportamento quando off.
  - Bulk: quando `enableBulkActions && !isWidgetMode`, GenericTable mostra coluna de checkbox (seleção por linha + select-all da página) e expõe seleção via callback; GenericTabbedView mostra uma **barra de ações em massa** quando `selected.size>0` ("Excluir selecionados" → `ConfirmDeleteModal` → `deleteRecordsBatch` → refetch + limpar seleção). `useMemo`/`useCallback` na seleção.
- **GenericTable**: adicionar coluna `_select` (checkbox) só quando `enableBulkActions && !isWidgetMode`; seleção interna (Set) + `onSelectionChange`. Não quebra colunas/sort existentes (checkbox não-sortável).
- **CrmTableScreen**: passar `enableSavedViews enableBulkActions` = true (único caller que liga).
- i18n en+pt: views.{save,save_as,apply,delete,name,empty,placeholder,saved}, bulk.{selected,delete,confirm,deleting,cleared}. Sem hardcoded.

## Segurança (gates)
- Saved views: escopo por userId; cross-tenant (view de outro user) = NotFoundError; policy-first. Batch delete: cada id validado como pertencente a uma tabela do user (o `deleteTableData` já força canManageData) — não permitir deletar rows de outro tenant; cap de tamanho; atômico (runInTransaction). Sem vazar ids/tabelas alheias.

## Aceite (gates)
- [ ] server tsc + jest verdes (testes: saved views CRUD + cross-tenant NotFound; batch delete soft-deleta N + rejeita cross-tenant); my-app tsc + parity.
- [ ] Migration `saved_table_views` aplicada na dev.db viva (dados intactos).
- [ ] E2E live: salvar uma view (filtro+ordenação) → recarregar/list → aplicar → estado restaurado; selecionar N leads/contatos → bulk delete → somem (soft). Tabelas não-CRM inalteradas (props off).
- [ ] Opt-in comprovado: nenhum outro caller de GenericTabbedView passa as flags.

## Verificação
- Revisão adversarial (ownership de views, tenant-scope do batch delete, opt-in/blast radius, soft-delete). Rollout live após review + tsc/jest verdes.
