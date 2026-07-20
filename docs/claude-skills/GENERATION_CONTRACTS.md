# Generation Contracts

> Regras cross-cutting de arquitetura e qualidade (gate) vivem em `.claude/skills/_ARCHITECTURE-CONTRACT.md`. Este arquivo cobre apenas o scaffolding (paths/nomes) por camada.

## Backend Route Contract

- File: `server/src/routes/<resource>.ts`
- Pattern: `import { Router } from 'express'`, named controller imports, `const router = Router()`, `router.get/post/put/patch/delete`, `export default router`
- **Registration = 2 toques (auth is deny-by-default):**
  1. Import + mount in `server/src/routes/index.ts` at `/api/<resource>`
  2. OpenAPI: Add JSDoc `@openapi` blocks in `server/src/routes/docs.paths.ts`
  - **Do NOT touch `server/src/middleware/auth.ts` for protected routes** — the middleware denies any `/api/*` request without a valid JWT by default (the old `protectedApiPaths` array no longer exists; forgetting a registration fails closed with 401, never open). A **public** route is the explicit exception: add a `{ path, method, match: 'exact' | 'prefix' }` rule to the `publicApiRoutes` array inside the middleware itself.

## Backend Controller Contract

- File: `server/src/controllers/<Resource>Controller.ts`
- Exports: Named async functions only — no default export
- Signature: `async (req: Request, res: Response) => { ... }`
- Zod validation: Inline schemas named `<Action><Resource>Schema` (e.g., `CreateAppointmentSchema`)
- Validation guard: `const parse = Schema.safeParse(req.body); if (!parse.success) return res.status(400).json({ success: false, error: parse.error.flatten() })`
- User context: `const actor = getUserContextFromRequest(req)`
- Service: `const service = getFactory().get<Resource>Service()`
- Success response: `return res.json({ success: true, data: result })` or `res.status(201).json(...)` for creation
- Error handling: `return handleApiError(error, res)` in catch block
- No business logic in controllers — delegate to service immediately

## Backend Service Contract

- File: `server/src/features/<resource>/services/<Resource>Service.ts`
- Pattern: `export class <Resource>Service { constructor(private repo: I<Resource>Repository, private policy: I<Resource>Policy) {} }`
- Typed error throws: `ServiceError`, `ForbiddenError`, `NotFoundError`, `UnauthorizedError`, `ValidationError` from `lib/errors`
- Auth check: call `this.policy.canXxx(actor, targetId?)` before any data access
- Factory registration: Add to `lib/factory.ts` constructor + getter method `get<Resource>Service()`
- Interface: Create `I<Resource>Service.ts` only if the service has complex public API or is injected into other services
- Actor param: services accept `actor: IUser | null` (import `IUser` from `features/users/models/User.model`, NOT `@prisma/client`); `UserContext` from the controller is structurally assignable to `IUser`
- Never import prisma directly — always via repository
- **Prisma model types** (in repositories/interfaces) import from `'generated/prisma'`, NEVER `@prisma/client` (the project uses a custom Prisma output path)

### Orchestration-over-DynamicTable variant

For DynamicTable-backed domains (leads, ERP, CRM) the service orchestrates `DynamicTableService` instead of owning a Repository/Policy (pattern: `LuminarisAgentService`, `CrmPipelineService`):
- Inject `DynamicTableService` + `IDynamicTableRepository`.
- Resolve tables by `internalName` (preset key): `repository.findTableByInternalName(user.userId, 'leads')`.
- `createTableData(user, tableId, { data })` / `getTableData(user, tableId, page, limit)` take the **tableId**; `updateTableData(user, dataId, { data })` / `deleteTableData(user, dataId)` take the **record dataId** (table resolved internally).
- No redundant policy — `DynamicTableService` already enforces `canManageData` on every write.

## Backend Repository Contract

- File: `server/src/features/<resource>/repositories/<Resource>Repository.ts`
- Interface: `server/src/features/<resource>/repositories/I<Resource>Repository.ts`
- Pattern: `export class <Resource>Repository implements I<Resource>Repository { ... }`
- Always imports: `import prisma from '../../../lib/prisma'`
- Prisma model access: `prisma.<modelName>.findMany/findUnique/create/update/delete`
- Bulk ops: use `prisma.$transaction([])`
- Soft delete: `where: { deletedAt: null }` filter on all finds; set `deletedAt: new Date()` on delete
- Password exclusion: explicit `select: {}` without `password` field in all public-facing queries

## Backend Policy Contract

- File: `server/src/features/<resource>/policies/<Resource>Policy.ts`
- Interface: `server/src/features/<resource>/policies/I<Resource>Policy.ts`
- Pattern: `export class <Resource>Policy implements I<Resource>Policy { canXxx(actor: IUser | null, targetId?: string): boolean {} }`
- Actor type: always `IUser | null` — null means unauthenticated
- Role check: `actor.role === Role.ADMIN` or `actor.id === targetId`
- No throws — return boolean only
- Methods naming: `canCreate`, `canView`, `canUpdate`, `canDelete`, `canListAll`, `canChangeXxx`

## Backend DTO Contract

- File: `server/src/features/<resource>/dtos/<Resource>Dto.ts`
- Pattern: One file per resource with Create, Update, and Read schemas
- OpenAPI JSDoc: `@openapi components: schemas: <Name>:` comment block above each schema
- Types: `export type <Resource>Dto = z.infer<typeof <Resource>Schema>`
- Type guards: `export function is<Resource>Dto(obj: unknown): obj is <Resource>Dto { return <Resource>Schema.safeParse(obj).success }`
- Validation messages: Inline strings like `'Name cannot exceed 100 characters'`
- Domain model: Companion `<resource>/models/<Resource>.model.ts` with `interface I<Resource>` and enums

## Frontend Page Contract

- File: `my-app/pages/<resource>/index.tsx` and `my-app/pages/<resource>/[id].tsx` if needed
- Auth guard: use `withAuth` HOC from `lib/hoc/withAuth.tsx` OR check `useAuth()` and redirect
- i18n: `export const getServerSideProps = async ({ locale }) => ({ props: { ...(await serverSideTranslations(locale, ['common', '<namespace>'])) } })`
- Dynamic imports: heavy components loaded with `dynamic(() => import(...), { ssr: false })`
- Page-level data: `GetServerSideProps` for initial data, otherwise fetch in component with hooks

## Frontend Feature Module Contract

- Directory: `my-app/features/<name>/`
- Sub-folders: `components/`, `hooks/`, `types/`, `utils/`, `services/` (optional)
- Category view: `my-app/features/dashboard/category-views/<name>/<Name>View.tsx` as main export
- Registration: Add dynamic import in `my-app/pages/dashboard/index.tsx`

## Frontend Widget Contract

- Directory: `my-app/components/widgets/<name>/`
- Props: explicit TypeScript interface `<Name>WidgetProps`
- States: must handle loading, error, and empty states explicitly
- Layout: compatible with `react-grid-layout` grid constraints (w/h units)
- Context: read from `DashboardDataContext` for shared state; local state for widget-specific

## Dynamic Table Preset Contract

- File: `server/src/features/dynamicTables/presets/modules/<category>/<Name>Module.ts`
- Export: named `export const <name>Module = { name, description, category, schema: { defaultDisplayField, fields: [...] } }`
- Field types: `string`, `number`, `date`, `datetime`, `boolean`, `select`, `relation`
- Relation fields: `{ type: 'relation', relation: { targetTable: '@@PRESET_TABLE_KEY::<internalName>' } }`
- Field presets: reuse from `presets/fields/` (e.g., `import { email, phone } from '../../fields/text/TextPresets'`)
- Registration: Add to system preset in `presets/systems/<System>Preset.ts`
- **Limites de plataforma (gate — ver Contrato §2.1):** dinheiro = inteiro em **centavos** (`numberFormat:'integer'`), nunca decimal/float; hierarquia por **code codificado** (`parentId` auto-relacional NÃO é suportado — não há precedente nem tree view); `compositeUnique` é app-level/TOCTOU, **não** constraint de DB.

## Analytics KPI Contract

- Processor file: `server/src/features/analytics/kpis/<name>/<Name>KpiProcessor.ts`
- Processor type: `export const <name>KpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => { ... }`
- Context destructure: `const { rows, params, table } = context`
- Single-pass: iterate rows ONCE accumulating all metrics
- Template file: `server/src/features/analytics/kpis/<name>/<Name>KpiTemplate.ts`
- Registration: Add to `server/src/features/analytics/kpis/index.ts`
- Test: `__tests__/<Name>KpiProcessor.test.ts` with mock rows

## Workflow Transition Service Contract

- Service file: `server/src/features/<domain>/services/<Domain>WorkflowService.ts` (orquestração — sem Repository/Policy próprios)
- Constructor: injects `DynamicTableService` + `IDynamicTableRepository`
- Table resolution: `repository.findTableByInternalName(user.userId, internalName)` → `NotFoundError` se não instalada
- Atomicidade: todas as escritas dentro de `dynamicTableService.runInTransaction(async (tx) => {...})` com `createTableData`/`updateTableData` recebendo `{ tx }`
- Side effects: condicionais ao tipo de etapa de destino (ex.: criar proposta em etapa `proposal`); transição + efeitos commitam/rollback juntos
- DTO: `dtos/<Domain>Transition.dto.ts` (Zod + `@openapi` + type guard); Controller fino (`safeParse` + factory + `handleApiError`); Route 2-toques (`index.ts` + `docs.paths.ts`; auth deny-by-default); Factory getter `get<Domain>Service()`
- Test: `buildService` + mock `runInTransaction`/`findTableByInternalName`; assert atomicidade (1× `runInTransaction`) + cross-tenant `NotFoundError`
- Golden ref: `server/src/features/crm/services/CrmPipelineService.ts` (`advanceStage`)
- **Caminho de dinheiro (gate — ver Contrato §2.1):** valores em **centavos inteiros**; invariantes de fechamento (`Σdébito=Σcrédito`) = igualdade inteira exata; idempotência via `compositeUnique(sourceKey)` + check no service com **teto `ponytail:` nomeado** (não é constraint de DB); registro postado/terminal imutável exige **guarda de delete** na camada de serviço (soft-delete não consulta `immutableAfter`).

## Frontend Kanban Workflow Contract

- Board file: `my-app/features/<module>/<Name>Board.tsx` — REUSA `InternalKanbanView`/`KanbanColumn`/`KanbanCardDetailModal` + `@dnd-kit` (`DndContext`/`PointerSensor`/`DragOverlay`)
- Hook: `hooks/use<Name>Board.ts` — colunas (status-enum OU stage-relation filtrada pelo pai ativo) + `handleDragEnd`
- Drag-end: `DynamicTableService.updateRecord` (simples) OU endpoint de transição (efeitos colaterais), com optimistic update + rollback
- Card click → `KanbanCardDetailModal` (modal, NUNCA `router.push`)
- Create → `FloatingActionButton`; filters → `KanbanFilterBar`; container full-height; resolve por `internalName`; pagina ao ler
- Golden ref: `my-app/features/dashboard/category-views/kanban/InternalKanbanView.tsx` (+ `hooks/useKanbanLogic.tsx`). Verificada: `my-app/features/crm/components/CrmPipelineBoard.tsx`. Anti-exemplo: `my-app/pages/crm/pipeline.tsx` antigo (board estático)

## Frontend Table Screen Contract

> Skill: `frontend-table-screen-generator`

- Wrapper file: `my-app/features/<module>/components/<Name>TableScreen.tsx` — REUSA `GenericTabbedView` (que traz `GenericTable`/`GenericRow`/`RowActionsCell` + `GenericFilterBar` + `StandardPagination` + relation lookups). **Não** escreva `<table>` próprio.
- Resolve a `IDynamicTable` (com schema) por `internalName` via `DynamicTableService.getTables()` (`find(x => x.internalName === key || x.name === 'Human Name')`, nunca `[0]`); `useMemo`; estados loading/error/não-instalada.
- Render: `<GenericTabbedView tables={[table]} title={t(titleKey)} description={t(descriptionKey)} />` — CRUD (create→`createRecord`, edit→`updateRecord`, delete soft→`deleteRecord`), filtros, sort e paginação (25/pg) vêm do wrapper.
- Página: shell full-height + `withAuth` + `serverSideTranslations(locale, ['common', '<namespace>', 'database'])` — o `database` namespace é obrigatório (cabeçalhos/filtros do `GenericTabbedView`).
- Duas camadas de paginação (não confundir): **rede** = `useTableData` busca TODAS as páginas (limit=200 até `totalPages`, derrota o cap de 50 da API); **display** = `GenericTabbedView` fatia o conjunto carregado em 25/pg via `StandardPagination`. Validar com **>50 registros**.
- Golden ref: `my-app/features/dashboard/category-views/shared/GenericTabbedView.tsx` (+ verificada: `my-app/features/crm/components/CrmTableScreen.tsx`). Anti-exemplo: `RecordTable.tsx` (deletado)

## Frontend Modal Contract

> Skill: `frontend-modal-generator`

- Modal file: `my-app/features/<module>/components/<Name>Modal.tsx` — construído sobre `my-app/components/ui/Modal.tsx` (`{ isOpen, onClose, title?, children, maxWidth?, footer?, headerActions?, isDirty?, themeColor? }`); **não** reimplemente portal/overlay/esc/focus-trap.
- Estado na view-pai: `const [selected, setSelected] = useState<T|null>(null)`; `isOpen={!!selected}` + `onClose={() => setSelected(null)}`. O clique de detalhe **substitui** qualquer `router.push`.
- Tipos: `detail` (conteúdo do registro + ação via service + `onChanged?`), `edit` (form/`DynamicForm` → `updateRecord`, `isDirty`), `confirm` (reusa `ConfirmDeleteModal`/`ConfirmModal`), `capture` (coleta input → `onConfirm(payload)`; cancelar = nenhuma escrita).
- Escritas via service layer; props sem `any`; loading/error; i18n via `t()`; `neutral`/`rounded-2xl`/dark.
- Golden refs: `my-app/components/ui/Modal.tsx`, `KanbanCardDetailModal.tsx`, `ConfirmDeleteModal.tsx` (+ verificadas: `my-app/features/crm/components/Lead360Modal.tsx`, `ProposalCaptureModal.tsx`)

## RAG / Document Processing Contract

- Extractor: `server/src/lib/vector/extractors/<type>.ts` — exports async fn returning `{ text: string }`
- Chunking: via `server/src/lib/vector/chunking.ts`
- Embedding: via `server/src/lib/vector/embedding.ts` using OpenAI
- Qdrant storage: via `server/src/lib/vector/qdrant.ts`
- Status tracking: update `Document.status` (PENDING → PROCESSING → COMPLETED | ERROR)
