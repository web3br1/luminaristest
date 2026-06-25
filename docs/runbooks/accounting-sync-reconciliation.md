# Runbook — AccountingSync Reconciliation

Operational guide for the AccountingSync reconciliation job (Incremento B.1).

## Purpose

When a CRM opportunity reaches **Won**, the controller posts a revenue journal entry
**post-commit** (best-effort, non-fatal). If that post fails after the CRM transition
commits, the journal entry is missing. The **reconciliation job** re-drives every Won
opportunity that has no journal entry yet, idempotently. It is the durability backbone
that closes the gap between "deal won" and "revenue booked".

- Scheduler: `server/src/jobs/AccountingSyncScheduler.ts`
- Reconciliation core: `server/src/jobs/accountingSyncReconcile.job.ts` (`runAccountingSyncReconcile()`)
- Manual CLI: `server/src/jobs/accountingSyncReconcileCli.ts`

## Consistency model

The source fact (opportunity Won) and the accounting posting are **NOT** a single
distributed transaction — `PostingService.postEntry` opens its own root transaction and
SQLite cannot nest interactive transactions. Consistency is **eventual**, made safe by
PostingService's idempotency on `@@unique([userId, unitId, sourceType, sourceId])`:

- re-driving an already-booked opportunity is a no-op (`idempotentHit`);
- a concurrent double-post is resolved by the unique constraint (P2002 race-close);
- re-running the whole job is always safe.

`sourceType = 'crm.opportunity.won'`, `sourceId = <opportunityId>`.

## ⚠️ Single-process limitation (read before production)

The scheduler's overlap lock is **process-local**. It prevents two concurrent runs in
**one** Node process only. It does **NOT** protect against multiple replicas — N replicas
would each run the job. This is safe for correctness (postEntry idempotency dedupes), but
wastes work and muddies logs.

**Before declaring production-ready, one of:**
1. confirm the deployment is **single-process**, OR
2. run the job from an **external scheduler with `concurrency=1`** (and disable the
   in-process scheduler via a large/disabled interval), OR
3. open an ADR for a **distributed lease** (DB advisory lock / leader election).

Do not represent the process-local lock as distributed.

### ✅ Resolved — Gate 1 (single-process), decided 2026-06-25

**Gate 1 applies.** The backend runs as a single process/replica: persistence is
**local-file SQLite** (`provider = "sqlite"`, `DATABASE_URL=file:/data/dev.db` on the
single `sqlite_data` volume), which cannot be shared across replicas, and `docker-compose.yml`
defines a single `server` service with no replicas/scaling. The in-process scheduler is
therefore correct, no external scheduler or distributed lease is needed, and **no ADR is
required**. B.1 is production-ready under this model. Full rationale + the upgrade path for a
future multi-replica topology: `docs/runbooks/DEPLOYMENT.md`.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `ACCOUNTING_SYNC_RECONCILE_INTERVAL_MS` | `300000` (5 min) | Interval between runs. Positive integer (ms). Invalid value → server fails fast at start. |
| `ACCOUNTING_SYNC_RECONCILE_INITIAL_DELAY_MS` | `60000` (1 min) | Delay before the first run after boot. Integer ≥ 0 (ms). |
| `NODE_ENV` | — | When `test`, the scheduler does **not** start timers. |

## Frequency

First run `INITIAL_DELAY_MS` after server boot, then every `INTERVAL_MS`. Default cadence
is every 5 minutes — tune to the acceptable window between "deal won" and "revenue visible".

## Manual execution (reprocess)

```bash
cd server
npm run build
npm run accounting:reconcile
```

The CLI runs one pass, prints a structured summary line to stdout, disconnects Prisma, and
exits **0** when `failed = 0`, non-zero otherwise. Safe to run anytime (idempotent).

## Interpreting the logs

All scheduler logs carry `job: "accounting_sync_reconcile"` and a per-run `runId`.

| `event` | Meaning |
|---|---|
| `start` | A run began (`startedAt`). |
| `complete` | A run finished. Fields: `durationMs`, `total`, `synced`, `idempotentHits`, `failed`. |
| `failed` | The run threw. Fields: `errorName`, `errorMessage`. |
| `skipped` | Run not executed. `reason: skipped_due_to_lock` (overlap), `disabled_in_test`, or `already_started`. |

Summary counters: `total` = Won opportunities scanned; `synced` = newly booked; `idempotentHits`
= already booked (no-op); `failed` = items that errored (job continued past them).

## Alert criteria

- **`failed > 0`** in a `complete` event → some opportunities did not book; investigate (see below). Re-running is safe and may clear transient failures.
- **No `complete` event within two intervals** (e.g. >10 min at default cadence) → scheduler stalled or process down. Check the process / restart.
- **Consecutive `skipped` with `skipped_due_to_lock`** → a run is hung (a single pass never completes). Inspect for a stuck DB connection.
- **Fatal scheduler error / repeated `failed`** → escalate; consider running the manual CLI to confirm and to get the exit code.
- **Growing backlog**: rising `synced` per run (each run books many) suggests the live post-commit trigger is failing often — investigate the controller path, not just reconciliation.

## Diagnosing a Won opportunity with no journal entry

1. Confirm the opportunity is `status = "Won"` and has a `unitId` (a missing `unitId` is
   skipped and counts as `failed` — the opportunity must have a unit).
2. Confirm `amount` is a finite, positive number (the mapper rejects `NaN`/`Infinity`/`≤0`).
3. Run `npm run accounting:reconcile` and read the summary. A successful book moves it from
   `failed`/missing to `synced`; a subsequent run reports it as `idempotentHit`.
4. If it keeps failing, inspect the `errorMessage` — a `ValidationError` means bad data
   (amount/unit), not a transient fault; fix the source record.

## Safe re-execution

Re-running the job (scheduler tick or manual CLI) never double-books — postEntry idempotency
guarantees one entry per `(sourceType, sourceId)` per tenant+unit. Run it as often as needed.

## Operational rollback

This increment adds **only** scheduling/observability/CLI around an existing job — no schema,
no migration, no changes to PostingService/AccountingSyncService. To disable in production
without a redeploy of the accounting logic:

- set `ACCOUNTING_SYNC_RECONCILE_INITIAL_DELAY_MS` very high to defer the first run, or
- revert the `accountingSyncScheduler.start()` call in `server.ts` and redeploy.

The reconciliation core and the live post-commit trigger are unaffected by disabling the scheduler.

## After a partial failure

A `complete` event with `failed > 0` means some items errored but the batch finished. Steps:
1. Identify failing opportunities from the `failed`-context logs (`opportunityId`, `errorMessage`).
2. Fix any data-level cause (missing unit, bad amount).
3. Re-run `npm run accounting:reconcile`; confirm `failed = 0`.

## Closing an incident

Declare the incident resolved only when:
- a `complete` event reports **`failed = 0`**, AND
- the count of Won opportunities lacking a journal entry is **0** (a clean run reports them as `synced`/`idempotentHit`, none `failed`), AND
- the manual CLI exits **0**, AND
- the cause of the original failure (transient DB vs bad data) is recorded.
