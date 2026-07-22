# Skills Recreation Plan — Antigravity (`.agent`) → Claude Code (`.claude`)

Plan to **recreate** (not literally copy) the useful skills from the old Antigravity app's
`.agent/skills/` into `.claude/skills/`, in the ideal Claude Code format, with consistent naming and
trigger-optimized descriptions.

## Key facts (the why)

- **Claude Code only reads `.claude/skills/`.** `.agent/` is the Antigravity app's config — its 16 skills
  are **inactive in Claude Code**. To be usable here, a skill must live in `.claude/skills/`.
- **Recreate, don't migrate.** The `.agent` skills are older (pre-current-code) and use the Antigravity
  voice. Each target skill is **written fresh**: read the `.agent` source for the knowledge, verify it
  against the **current code/docs**, then author a clean SKILL.md in our format.
- **Backend `.agent` skills are superseded.** `backend-crud-standards`, `backend-feature-review`,
  `backend-testing-standard` are older versions of our current `.claude` backend skills — **not
  recreated** (one open question: salvage the *scoring rubric* from `backend-feature-review`? — Stage 4).

## The ideal skill format (apply to every recreation)

- **`name`** — short kebab-case with a **group prefix** (`frontend-`, `analytics-`, `dynamictables-`).
- **`description`** — the trigger mechanism. State **what it does + when to use it + concrete trigger
  phrases (PT and EN)**, and be slightly "pushy" (Claude under-triggers skills). All "when" info goes here.
- **Body** — lean (<500 lines), imperative, **explain the why** (no rigid MUSTs), point to the canonical
  source in the repo (code/docs), cross-reference sibling skills. **English prose** (`backend-docs` rule).

## Target taxonomy (groups → skills → source)

### Group: `frontend-*` (the `my-app` frontend)
| New skill | From `.agent` | Covers |
|---|---|---|
| `frontend-architecture` | frontend-architecture-standard | Flat Service Architecture (`my-app/lib/services`), no fetch in components |
| `frontend-widget` | frontend-widget-standard | Dashboard widgets: B2B aesthetics, isolated data fetching |
| `frontend-dashboard-grid` | dashboard-grid-standard | The scrollable canvas widget grid (dashboardLayout's frontend) |
| `frontend-analytics-dashboard` | frontend-dashboard-standard | KPI grid + master-detail analytics dashboard |
| `frontend-category-view` | category-view-standard (393L) | Category views (People/Products/…); big — keep a lean SKILL.md + `references/` if needed |
| `frontend-relation-display` | ui-relation-resolving | Resolving technical IDs → human names (`defaultDisplayField`) |

### Group: `analytics-*` (KPI/analytics engine)
| New skill | From `.agent` | Covers |
|---|---|---|
| `analytics-kpi` | backend-analysis-engine **+** kpi-gold-standard | How the KPI engine computes **and** the gold bar for authoring a KPI (merge — both small + tightly related) |
| `analytics-pipeline` | analytics-aggregate-pipeline | No-code charts/metrics via the Aggregate Pipeline |

### Group: `dynamictables-*` (the core subsystem) — do during the dynamicTables work
| New skill | From `.agent` | Covers |
|---|---|---|
| `dynamictables-governance` | dynamic-table-governance | The declarative governance engine: order, guards, noOverlap, immutableAfter |
| `dynamictables-modules` | dynamic-table-modules | Authoring backend modules + `defaultDisplayField` standard |
| `dynamictables-rules` | dynamic-table-rules-plugins | Writing/reviewing rule plugins (RuleRegistry contract, hooks) |

### Group: `backend-*` (already in `.claude`, current) — no recreation
`backend-feature`, `backend-testing`, `backend-docs`, `backend-infra`, `backend-scope`. The 3 `.agent`
backend skills are superseded.

> Merge/split decisions (analytics merge, category-view references split) are **confirmed during
> recreation** by reading the full source + current code — not locked here.

## Recreation recipe (per skill)

1. **Read the `.agent` source** SKILL.md — the domain knowledge.
2. **Verify against current code/docs** — the source predates recent work; confirm paths, component
   names, and patterns still exist (e.g. `my-app/lib/services/*`, `AnalyticsDashboard.tsx`, the analytics
   engine, the dynamicTables docs). Fix anything stale; cite the canonical file as the source of truth.
3. **Author `.claude/skills/<name>/SKILL.md`** in the ideal format (name, pushy description with PT+EN
   triggers, lean imperative body that explains the why, cross-refs to siblings, English).
4. **Check trigger overlap** with existing skills (no two skills fight over the same query; complementary
   is fine with cross-refs).
5. **Verify it registers** (appears in the available-skills list) and sanity-check a trigger phrase.

## Staged rollout

- **Stage 1 — `frontend-*` (6 skills). ✅ DONE (2026-06-26).** Created `frontend-architecture`,
  `frontend-widget`, `frontend-dashboard-grid`, `frontend-analytics-dashboard`, `frontend-category-view`,
  `frontend-relation-display` — all lean (27–35 LOC), anchored to the current canonical docs
  (`my-app/ARCHITECTURE.md`, `components/widgets/README.md`, `category-views/shared/GENERIC_VIEW.md`,
  per-category READMEs), with PT+EN triggers and cross-disambiguating descriptions. Stale paths fixed
  (the analytics dashboard now lives under `category-views/<cat>/components/analytics/`). All 11 skills
  register; overlaps handled via cross-refs.
- **Stage 2 — `analytics-*` (2 skills). ✅ DONE (2026-06-26).** Created `analytics-kpi` (engine
  mechanics + gold KPI authoring bar, merged from backend-analysis-engine + kpi-gold-standard) and
  `analytics-pipeline` (no-code aggregate charts). Anchored to `analytics/README.md` +
  `docs/ANALYTICS_DOCUMENTATION.md`. Stale fixes: `AggregatePipelineProcessor` is in
  `analytics/dynamic/processors/` (not `core/processors/`); **dropped the "MongoDB cursor" advice** (this
  stack is Prisma/SQLite — verified no Mongo in the code).
- **Stage 3 — `dynamictables-*` (3 skills). ✅ DONE (2026-06-26).** Created `dynamictables-governance`,
  `dynamictables-modules`, `dynamictables-rules`, anchored to `dynamicTables/docs/*` + `presets/README.md`.
  Paired with a light review: dynamicTables **re-included in the lint gate** (3 trivial errors fixed —
  cause/const/empty-catch); lint 0 errors, tsc clean, the 35-test characterization suite green. The ~333
  `as any` warnings (plugin typing) remain as known non-blocking debt. (User will extend dynamicTables
  later — mostly additions, not fixes.)
- **Stage 4 — Cleanup.** Decide the `backend-feature-review` rubric salvage (fold into `backend-feature`
  or drop). Then **delete `.agent/`** (it's another tool's config; nothing in Claude Code uses it).

## Finishing each stage

Each new skill registers and triggers sensibly; descriptions reviewed for overlap. **Optional rigor:**
run the skill-creator's description optimizer (`run_loop.py`) per group to measure trigger accuracy on
realistic queries (especially where a new skill could compete with an existing one). Record the taxonomy
decisions in memory.
