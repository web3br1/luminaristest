# Generation Contracts

> Regras cross-cutting de arquitetura e qualidade (gate) vivem em `.claude/skills/_ARCHITECTURE-CONTRACT.md`. Este arquivo cobre apenas o scaffolding (paths/nomes) por camada.

## Backend Route Contract

- File: `server/src/routes/<resource>.ts`
- Pattern: `import { Router } from 'express'`, named controller imports, `const router = Router()`, `router.get/post/put/patch/delete`, `export default router`
- **Registration = 3 toques (não 2):**
  1. Import + mount in `server/src/routes/index.ts` at `/api/<resource>`
  2. **Add `'/api/<resource>'` to the `protectedApiPaths` array in `server/src/middleware/auth.ts`** — the auth middleware only populates the user context for prefixes in this allowlist. Miss it and the route returns **401 with a valid token** (`getUserContextFromRequest` returns `null`). Not caught by `tsc` — runtime-only. (Skip ONLY for fully public routes.)
  3. OpenAPI: Add JSDoc `@openapi` blocks in `server/src/routes/docs.paths.ts`

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

## Analytics KPI Contract

- Processor file: `server/src/features/analytics/kpis/<name>/<Name>KpiProcessor.ts`
- Processor type: `export const <name>KpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => { ... }`
- Context destructure: `const { rows, params, table } = context`
- Single-pass: iterate rows ONCE accumulating all metrics
- Template file: `server/src/features/analytics/kpis/<name>/<Name>KpiTemplate.ts`
- Registration: Add to `server/src/features/analytics/kpis/index.ts`
- Test: `__tests__/<Name>KpiProcessor.test.ts` with mock rows

## RAG / Document Processing Contract

- Extractor: `server/src/lib/vector/extractors/<type>.ts` — exports async fn returning `{ text: string }`
- Chunking: via `server/src/lib/vector/chunking.ts`
- Embedding: via `server/src/lib/vector/embedding.ts` using OpenAI
- Qdrant storage: via `server/src/lib/vector/qdrant.ts`
- Status tracking: update `Document.status` (PENDING → PROCESSING → COMPLETED | ERROR)
