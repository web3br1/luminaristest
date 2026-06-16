# CRM Remediation — SDD Spec (Phases 0, 1, 2)

> Spec-driven contract for executing **Parte A / Fases 0–2** of `docs/crm/CRM_REMEDIATION_AND_ROADMAP.md`.
> Every signature below was ground-truthed against the real code (understand pass, 2026-06-16). Implementers MUST read `.claude/skills/_ARCHITECTURE-CONTRACT.md` + the named skill before generating. Acceptance criteria are gates.

## Canonical signatures (verified — do NOT re-invent)

**Frontend service** — `my-app/lib/services/dynamic-table.service.ts` → `DynamicTableService`:
- `createRecord(tableId, payload, options?): Promise<RecordResponse>` — `payload = { data }`
- `updateRecord(tableId, recordId, payload, options?): Promise<RecordResponse>` — `payload = { data }`
- `deleteRecord(tableId, recordId, options?): Promise<unknown>` (soft delete)
- `getTableData(tableId, queryParams?)`, `getRecordById`, `getTables`, `getTableById`
- `options?: { successMessage?: string | null }` (pass `null` to suppress toast)

**CRM transition service** — `my-app/lib/services/crm.service.ts` → `CrmService`:
- `advanceStage({ leadId, stageId, stageType?, meetingAt?, amount?, currency?, winProbability? }): Promise<ApiResult>` → `POST /api/crm/pipeline/advance`
- `createProposal(...)`, `recordNoShow(...)`

**Canonical table stack** — `my-app/features/dashboard/category-views/shared/`:
- `GenericTabbedView` (default) — props `{ tables: IDynamicTable[], title, description, addButtonLabel?, isWidgetMode?, categoryKey? }`. Orchestrates data + filter + sort + pagination (25/pg) + create/edit/delete. **This is the wrapper to reuse for Phase 1.**
- `useGenericData(activeTableId, allTables?)` → `{ records, table, schema, isLoading, error, refetch, relationLookups, deleteRecord }`
- `GenericTable`, `GenericRow`, `RowActionsCell`, `GenericFilterBar`, `StandardPagination` (`features/dashboard/shared/components/`)
- `FloatingActionButton` (default) — `features/dashboard/components/shared/FloatingActionButton.tsx` (NOT in `components/ui`)
- `EditRecordButton` (default) — `features/dashboard/components/shared/EditRecordButton.tsx`
- `ConfirmDeleteModal` — `features/dashboard/shared/components/ConfirmDeleteModal.tsx`
- Types: `IDynamicTable { id, name, key?, internalName?, category?, schema }`, `ITableSchema { defaultDisplayField?, fields: ISchemaField[], ui? }` — from `features/dashboard/components/shared/dynamic-tables.client.ts`

**Canonical Kanban primitives** — `my-app/features/dashboard/category-views/kanban/`:
- `InternalKanbanView` — DndContext + `PointerSensor` (8px) + `closestCenter` + `DragOverlay`; columns from `status` select field; drag-end persists via `DynamicTableService.updateRecord(tableId, id, { data: { status } })` optimistic + rollback. **Reference for the dnd-kit setup pattern.**
- `KanbanColumn` (default) `{ id, title, tasks, table, onSuccess, onTaskClick, relationLookups? }` — `useDroppable`
- `SortableTaskItem` (default) — `useSortable`; `KanbanTaskCard` (default)
- `KanbanCardDetailModal` `{ isOpen, onClose, task, tableId, tableSchema, onUpdate, columnTitle?, relationLookups? }`
- `useKanbanLogic`, `useRelationLookups`

**Modal** — `my-app/components/ui/Modal.tsx` → `Modal` `{ isOpen, onClose, title?, children, maxWidth?='max-w-md', showCloseButton?, footer?, headerActions?, isDirty?, themeColor?='bg-blue-600' }` (portal, focus trap, esc, click-outside).

**CRM existing pieces (reuse):** `features/crm/components/CrmNav.tsx`, `LeadCard.tsx` (click→`router.push`), `ui/{ScoreGauge,StatusBadge,BantBars,GradientHeader}.tsx`, `lib/crmFetch.ts` (`fetchAllRows`, 200/pg), `hooks/{useCrmData,useCrmTable}.ts`. i18n: `public/locales/{en,pt}/crm.json` (namespace `crm`).

**Backend (Phase 2) — already complete, do NOT regenerate:** `CrmPipelineService.advanceStage`, `CrmPipelineDto` (`AdvanceStageSchema`: leadId, stageId, stageType?, meetingAt?, amount?, currency? BRL|USD|EUR, winProbability? 0-100), `crmController`, `routes/crm.ts` (`POST /api/crm/pipeline/advance`), factory `getCrmPipelineService`, test. Verified present + transactional.

---

## Phase 0 — Foundation: `CrmLayout` shell + consistent container

**Goal:** every CRM screen shares one full-height container; navigating between tabs never changes width/height. Resolves roadmap defects #3, #4 (layout part).

**Skill:** `frontend-feature-module-generator` + `frontend-design-system`.

**Build:**
- `my-app/features/crm/components/CrmLayout.tsx` — `export function CrmLayout({ children }: { children: React.ReactNode })`. Renders a full-height container `flex h-full flex-col` (dashboard pattern), `<CrmNav />` once at top, and an inner scrollable area (`flex-1 overflow-y-auto`) wrapping `{children}`. Padding via the inner area (`px-4 py-6` or the dashboard standard). No `max-w-*`. `neutral` surfaces, dark mode.

**Rewire (8 pages)** — `my-app/pages/crm/{index,pipeline,contacts,accounts,proposals,analytics,activities,meetings}.tsx` and `leads/[id].tsx`:
- Remove each page's own `<CrmNav />` render and its `mx-auto max-w-* px-4 py-6` wrapper (current values: index/contacts/accounts/proposals/analytics=`max-w-6xl`, pipeline=`max-w-7xl`, activities=`max-w-3xl`, meetings=`max-w-5xl`, leads/[id]=`max-w-4xl`).
- Wrap screen body in `<CrmLayout>…</CrmLayout>`. Keep each page's `getServerSideProps` + `serverSideTranslations(locale, ['common','crm'])` + auth guard intact.

**Acceptance (gate):**
- [ ] `cd my-app && npx tsc --noEmit` clean (no new errors).
- [ ] No `max-w-*` on any CRM page-level container; container is `flex h-full … flex-col`.
- [ ] `grep -rn "zinc-" my-app/features/crm my-app/pages/crm` → empty.
- [ ] CrmNav renders once (from CrmLayout), not duplicated per page.
- [ ] All 8 tabs + lead detail still render; i18n namespaces unchanged.

---

## Phase 1 — Tables on `GenericTable` (with CRUD)

**Goal:** Contacts/Accounts/Proposals become full canonical tables (add/edit/delete inline, filters, pagination) instead of bespoke read-only `RecordTable`. Resolves #1, #2, #7.

**Skill:** `frontend-component-generator` + `frontend-feature-module-generator`. Golden ref: `GenericTabbedView.tsx`.

**Approach — reuse `GenericTabbedView`:**
- Add `my-app/features/crm/components/CrmTableScreen.tsx` — `export function CrmTableScreen({ internalName, titleKey, descriptionKey }: { internalName: string; titleKey: string; descriptionKey: string })`.
  - Resolve the full `IDynamicTable` (with `schema`) for `internalName` (`crmContacts` | `crmAccounts` | `leadProposals`) from all tables. Source the table list the same way the dashboard category-views do (resolve via `DynamicTableService.getTables()` and find by `internalName` — never index `[0]`). Provide loading/error/empty states.
  - Render `<GenericTabbedView tables={[table]} title={t(titleKey)} description={t(descriptionKey)} />` so all CRUD/filter/sort/pagination/relation-lookups come from the canonical stack.
- Rewrite `pages/crm/{contacts,accounts,proposals}.tsx` to render `<CrmLayout><CrmTableScreen … /></CrmLayout>`.
- **Delete** `my-app/features/crm/components/RecordTable.tsx` and remove its imports.
- i18n: ensure `crm.contacts/accounts/proposals` have `title`/`subtitle` keys in en + pt (reuse existing where present).

**Acceptance (gate):**
- [ ] `cd my-app && npx tsc --noEmit` clean.
- [ ] Add (FloatingActionButton→`createRecord`), edit (EditRecordButton→`updateRecord`), delete (ConfirmDeleteModal→`deleteRecord` soft) all wired and functional on each of the 3 tables.
- [ ] `GenericFilterBar` + `StandardPagination` (25/pg) present; validate with **>50 records** (no silent truncation — `fetchAllRows`/GenericTabbedView fetch-all).
- [ ] `RecordTable.tsx` deleted; no dangling imports.
- [ ] Visual: identical to dashboard tables (`neutral`, `rounded-2xl`, dark mode).

---

## Phase 2 — Pipeline on canonical Kanban primitives + Lead360 in modal

**Goal:** the static bespoke pipeline board becomes interactive: drag a lead between stages → `CrmService.advanceStage` (with proposal capture when target stage type is `proposal`); clicking a card opens Lead360 in a **modal**, not a route. Resolves #6, #8. **Backend unchanged** (advanceStage exists).

**Skill:** `frontend-kanban-workflow-generator` (board). `backend-workflow-transition-generator` → **N/A, already satisfied** (document this; do not regenerate the service).

**Build — pragmatic `CrmPipelineBoard` (roadmap 2a "pragmatic" option):**
- `my-app/features/crm/components/CrmPipelineBoard.tsx` — reuse the dnd-kit setup from `InternalKanbanView`: `DndContext` + `PointerSensor` (8px activation) + `closestCenter` + `DragOverlay`. Columns = `leadStages` **filtered by the active pipeline** (preserve the correct grouping logic already in `pipeline.tsx`: filter stages by `pipelineId`, sort by `order`), default to the pipeline with most leads + a pipeline selector when `>1`. Each column is a droppable (pattern of `KanbanColumn`/`useDroppable` keyed by `stageId`); each lead card is a sortable wrapper (pattern of `SortableTaskItem`/`useSortable`) rendering the existing `LeadCard` (but onClick opens the modal, NOT `router.push`).
- `my-app/features/crm/hooks/useCrmPipelineBoard.ts` — columns (stages of active pipeline) + `handleDragEnd`:
  - On drop over a stage column: optimistic move; resolve `stageType = String(targetStage.data?.type)`; call `CrmService.advanceStage({ leadId, stageId: targetStage.id, stageType })`; on success `reload()` (from `useCrmData`); rollback local state on error (pattern of `useKanbanLogic.handleDragEnd`).
  - If `stageType === 'proposal'`: open a small capture `Modal` for `amount` (+ optional `currency`/`winProbability`) BEFORE calling `advanceStage` (pass those fields through). Cancel = rollback.
- `my-app/features/crm/components/Lead360Modal.tsx` — `Modal`-based detail reusing the current `leads/[id].tsx` content (`GradientHeader`, `ScoreGauge`, `StatusBadge`, `BantBars`, contact section, "Avançar etapa" button → `CrmService.advanceStage`). Props `{ isOpen, onClose, lead, stages, onChanged }`.
- Rewrite `pages/crm/pipeline.tsx` to render `<CrmLayout><CrmPipelineBoard /></CrmLayout>`. Card click sets selected lead → `Lead360Modal`.
- `LeadCard` click in **pipeline + overview** opens the modal (overview may keep its grid but route clicks through the modal, or keep router.push for overview deep-link — pipeline MUST use modal). Keep `pages/crm/leads/[id].tsx` as optional deep-link route.
- Create via `FloatingActionButton` (new lead in active pipeline/first stage); filters via a filter bar.

**Acceptance (gate):**
- [ ] `cd my-app && npx tsc --noEmit` clean.
- [ ] Dragging a lead between stages calls `advanceStage` and persists (verify a refetch shows the new stage); rollback on error.
- [ ] Target stage type `proposal` → capture modal collects `amount` before transition; `advanceStage` receives it.
- [ ] Card click opens Lead360 **modal** (no route change); validate the board with **>1 pipeline** (columns filtered by active pipeline only — no duplicate/empty columns).
- [ ] No static board left (`flex gap-* overflow-x-auto` without dnd) — uses `DndContext`/`DragOverlay`.
- [ ] No new backend files; `cd server && npx tsc --noEmit` still clean.

---

## Phase 3 — Activities pagination + Meetings calendar in shell (S, low risk)

**Goal:** activities timeline paginates (no unbounded render); meetings calendar is an on-brand card in the shell. Resolves #4. Both pages already sit inside `CrmLayout`.

**Verified canonical signatures:**
- `StandardPagination` `{ currentPage, totalPages, totalItems, itemsPerPage, onPageChange, className?, scrollToTop?=true }` — `features/dashboard/shared/components/StandardPagination.tsx`. Real usage: `TableView.tsx` (client-side slice, 25/pg).
- `useCrmTable('leadActivities')` returns ALL rows unsliced (fetch-all). `MeetingsCalendar` is ALREADY a `rounded-2xl` neutral card.

**Build (`pages/crm/activities.tsx`):**
- Add `const [currentPage, setCurrentPage] = useState(1)`, `itemsPerPage = 25`. Keep the existing `sorted` useMemo; add `paginatedSorted = useMemo(() => sorted.slice((currentPage-1)*25, currentPage*25), [sorted, currentPage])`. Render `paginatedSorted`. After the `</ol>`, render `<StandardPagination currentPage totalPages={Math.ceil(sorted.length/25)} totalItems={sorted.length} itemsPerPage={25} onPageChange={setCurrentPage} />`. Import from the canonical path.
- Reset `currentPage` to 1 when `sorted.length` shrinks below the current window (guard).

**Meetings:** container already compliant. Fix only the hardcoded PT strings in `MeetingsCalendar.tsx` (`'Carregando…'`, `'${n} reuniões encontradas'`) → route through `t()` (the `crm` namespace) for i18n parity.

**Acceptance (gate):**
- [ ] `cd my-app && npx tsc --noEmit` clean.
- [ ] Activities timeline shows ≤25 items/page with working `StandardPagination`; validate with **>50 activities**.
- [ ] Meetings calendar renders inside `CrmLayout` as a `rounded-2xl` neutral card; no hardcoded visible strings.

---

## Phase 4 — Analytics on canonical leaf components (M, medium risk)

**Goal:** retire bespoke `CrmKpiCard`/`CrmBarChart`/`CrmPieChart`/`CrmAnalyticsBoard`; render the existing `CrmAnalyticsBundle` via canonical `DashboardKpiCard` + canonical charts. Resolves #5. **Backend unchanged** (`/crm/pipeline-analytics` already returns the bundle).

**Verified facts:**
- Bundle (`lib/services/crm.service.ts`): `CrmAnalyticsBundle { cards, funnel, source, status, bant, proposals, activities: ChartDataPoint[] }`, `ChartDataPoint { name, value, previousValue? }`. Hook `useCrmAnalytics()` → `{ datePreset, setDatePreset, data, loading, error }`, presets `'thisMonth'|'lastMonth'|'thisYear'` (UI subset).
- `DashboardKpiCard` (default) — `{ title, value: string, change: string, trend: 'up'|'down'|'flat', details: {label,value}[], isCurrency?, sparklineData?: number[], showGraph? }`.
- `ChartRenderer` (default) — `{ chart: ChartPreset, data: ChartData, timeRange?, onPeriodChange?, highlightMetric? }`. Routes by `chart.type` to `BarLineAreaChart`/`PieDonutChart`. **It reads `chart.options` (isTemporal/labelMap/colors).**
- Delegate primitives (cleaner if `ChartRenderer` needs backend wiring): `BarLineAreaChart` `{ data: ChartDataPoint[], title, chartType: 'bar'|'line'|'area', colors: string[], currency?, isTemporal?, ... }`; `PieDonutChart` `{ data: ChartDataPoint[], title, isDonut, colors: string[], currency?, metricLabel?, labelMap?, isComposition? }`.

**Approach — adapter over canonical leaves:**
- **Implementer MUST first READ `ChartRenderer.tsx` end-to-end** and decide: (A) reuse `ChartRenderer` by synthesizing a static `ChartPreset` (`{ key, title, type, processor:'crm', options:{ isTemporal:false, colors, metricLabel } }`) + `ChartData` (`{ chart, data: bundle.<series> }`) per panel — **preferred** (matches contract §0 naming); OR (B) if `ChartRenderer` hard-requires backend-only fields/wiring that can't be safely synthesized, reuse its delegates `BarLineAreaChart`/`PieDonutChart` directly. Document which path and why.
- Create `my-app/features/crm/components/analytics/CrmAnalyticsDashboard.tsx` — `useCrmAnalytics()` for data + a date-preset selector (thisMonth/lastMonth/thisYear); a KPI grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, mirror `AnalyticsDashboard` layout) of `DashboardKpiCard`; a chart grid of the chosen chart component for funnel(bar)/source(donut)/status(donut)/bant(bar,%)/proposals(bar)/activities(bar). Loading/error/empty states. Reuse the existing analytics title/subtitle i18n keys.
- **KPI adapter** (`bundle.cards` → `DashboardKpiCard`): map each card by `name`. `change`/`trend` from `previousValue` (`pct = ((v-prev)/|prev|)*100`; `trend = pct>0?'up':pct<0?'down':'flat'`; `change` = signed `pct.toFixed(2)+'%'`, empty when no `previousValue`). `isCurrency=true` + BRL format for pipelineValue/forecast/avgTicket; `%` for winRate/bant-derived; days for avgCycleDays; plain number otherwise. `details=[]`, `showGraph={false}` (bundle has no per-point history → no fabricated sparkline). Use a small typed lookup `cards.find(c => c.name === key)`.
- **Chart adapter:** per panel, build the input the chosen component needs from the bundle series; pass a Luminaris palette (`['#3b82f6','#14b8a6','#10b981','#8b5cf6','#f59e0b','#ec4899','#ef4444','#6366f1']`); BANT panel formats `%`.
- Rewrite `pages/crm/analytics.tsx` to dynamically import `CrmAnalyticsDashboard` (ssr:false) inside `CrmLayout`; remove the `CrmAnalyticsBoard` import.
- **Migrate overview KPIs:** `pages/crm/index.tsx` currently uses `CrmKpiCard` (5 cards). Replace with `DashboardKpiCard` (these are single snapshot values → `trend:'flat'`, `change:''`, `details:[]`, `showGraph:false`, `isCurrency` where applicable). Keep the existing hot-leads grid.
- **Delete** `CrmKpiCard.tsx`, `analytics/CrmBarChart.tsx`, `analytics/CrmPieChart.tsx`, `analytics/CrmAnalyticsBoard.tsx`, and `components/__tests__/CrmKpiCard.test.tsx`. Grep my-app → **zero** dangling importers.
- i18n: any new visible string in `en/crm.json` + `pt/crm.json` (parallel).

**Acceptance (gate):**
- [ ] `cd my-app && npx tsc --noEmit` clean; `next build` succeeds.
- [ ] Analytics renders KPIs via `DashboardKpiCard` + charts via canonical `ChartRenderer` (or its delegates) — zero bespoke chart/KPI components remain in CRM.
- [ ] The 4 bespoke files + the test deleted; `grep -rn "CrmKpiCard\|CrmBarChart\|CrmPieChart\|CrmAnalyticsBoard" my-app` → empty.
- [ ] Overview KPIs render via `DashboardKpiCard`; date-preset switch refetches; empty bundle → no `NaN` (cards show 0/–, charts show empty state).
- [ ] Visual parity with finance analytics (`neutral`, `rounded-2xl`, trend badges); dark mode.

---

## Phase 5 — Design-system + i18n polish sweep (S, low risk)

**Goal:** every CRM surface is fully on-brand and fully localized. Scope = `my-app/features/crm/**` + `my-app/pages/crm/**` only (do NOT modify shared dashboard/finance components — flag those separately). Resolves residual §4/i18n drift.

**Audit + fix checklist (per contract §4 + §3 i18n):**
- [ ] Zero `zinc-*` (use `neutral-*`); dark borders `dark:border-neutral-800`.
- [ ] Containers that read as cards/timelines/lib-wrappers = `rounded-2xl`/`3xl` (inputs/buttons `rounded-xl`/`lg` stay).
- [ ] `dark:` variant present on **every** color class. (Known house-style exception: bare `text-gray-400` micro-labels matching `GradientHeader`/canonical KPI labels — leave, don't churn.)
- [ ] `font-black` on KPI values + uppercase section labels (`text-[10px] font-black uppercase tracking-widest`); `font-semibold` body.
- [ ] Badges = `color/10` bg + `color/20` border + `color-600` text (not solid).
- [ ] Palette only: blue accent, emerald positive, rose negative, amber warning.
- [ ] No hardcoded visible strings — all via `t()` in the `crm` namespace; every new key in BOTH `en/crm.json` + `pt/crm.json` (parallel, no empties). Includes data fallbacks rendered to the user (e.g. default "Lead" name) where reasonable.

**Method:** multi-agent audit over the full CRM surface → structured findings (severity + file + fix) → adversarial verify majors → apply confirmed fixes. CRM-local only.

**Acceptance (gate):**
- [ ] `cd my-app && npx tsc --noEmit` clean.
- [ ] `grep -rn "zinc-" my-app/features/crm my-app/pages/crm` → empty.
- [ ] i18n parity exact (script: 0 en-only / 0 pt-only / 0 empty).
- [ ] No hardcoded visible strings introduced across the CRM surface.

---

## Phase 6 — Verification gate (contract §6)

**Feasible here (no creds/seed needed) — all must pass:**
- [ ] `cd my-app && npx tsc --noEmit` and `cd server && npx tsc --noEmit` clean.
- [ ] `cd my-app && npx next build` succeeds (prod).
- [ ] `next start` boots; all 9 CRM routes SSR to HTTP 200 with zero server-side errors; `withAuth` gate + `_nextI18Next` props serialize.
- [ ] Final `luminaris-reviewer`-style adversarial pass over the **entire** CRM diff (all 6 phases) → no open blocker/major.
- [ ] Static design-system audit confirms on-brand surfaces by class (`neutral-900`, `rounded-2xl`) — proxy for computed-style proof.

**Requires user-provided login creds + seeded backend (NOT feasible in this environment — documented, not skipped silently):**
- [ ] `preview_inspect` proves computed surfaces = `rgb(23,23,23)` (neutral-900) + `rounded-2xl` = 16px past the auth gate.
- [ ] Interactive: drag a lead between stages persists (`advanceStage`); proposal-stage capture; Lead360 modal opens; tables add/edit/delete.
- [ ] Validate with **>50 records** (pagination) and **>1 pipeline** (board filtered by active parent).

These interactive proofs are the only items that cannot be completed without a running authenticated session against seeded CRM data; everything else in §6 is satisfied.

---

## Cross-phase verification (contract §6)
- `cd my-app && npx tsc --noEmit` after every phase (hard gate).
- Prod build for auth'd screens if doing visual proof (`next build && next start`); `preview_inspect` for `rgb(23,23,23)` surfaces + `rounded-2xl`.
- Run `luminaris-reviewer` on the CRM diff at the end.
- Sequencing: **0 → 1 → 2** (1 and 2 both depend on CrmLayout from 0). Do not parallelize across phases (shared files).
