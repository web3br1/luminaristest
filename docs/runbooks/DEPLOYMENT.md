# Deploy Notes — Luminaris backend

## AccountingSync Reconciliation — rollout decision

```text
Status: RESOLVED_FOR_CURRENT_DEPLOYMENT
Decision date: 2026-06-25
Gate: Gate 1 — single-process deployment

The current deployment model uses one backend server process and SQLite as a local
file database (`DATABASE_URL=file:/data/dev.db`) mounted on the `sqlite_data` Docker
volume. No multi-replica deployment artifact is present in the repository.

Therefore the in-process AccountingSync scheduler is acceptable for the current
deployment. A distributed lease ADR is not required for this model.

This decision must be revisited before any of the following changes:
- adding multiple backend replicas;
- moving away from local-file SQLite;
- introducing Kubernetes, PM2 cluster mode, Fly machines, or another multi-process
  deployment model;
- running the scheduler from more than one process.

If the backend becomes multi-replica, choose one:
1. disable the in-process scheduler and use an external scheduler with concurrency=1; or
2. open an ADR for a distributed lease / leader election mechanism.
```

## Deployment model: single-process (decided 2026-06-25)

The `server` backend runs as a **single process / single replica**. This is not a
preference — it is forced by the persistence layer:

- **DB is SQLite as a local file.** `server/prisma/schema.prisma` → `provider = "sqlite"`;
  `DATABASE_URL=file:/data/dev.db` in `docker-compose.yml`, backed by the local named
  volume `sqlite_data` mounted into the single `server` container. A local-volume SQLite
  file cannot be shared across machines or replicas, so the topology is structurally
  single-node. ("Stay on SQLite, no Postgres" is a committed decision.)
- **docker-compose defines one `server` service** — no `deploy.replicas`, no scaling,
  `restart: unless-stopped`. There is no Kubernetes / PM2-cluster / Fly manifest that
  would fan the process out.

If this ever changes (multiple replicas, or a move off local-file SQLite), the
single-process assumptions below must be re-evaluated **before** scaling out.

## AccountingSync reconciliation scheduler — Gate 1 (single-process) ✅

The reconciliation scheduler (`server/src/jobs/AccountingSyncScheduler.ts`) uses a
**process-local overlap lock**. Per the runbook's "Single-process limitation" gate, the
deployment being single-process means:

- **Gate 1 is satisfied** — the in-process scheduler (`accountingSyncScheduler.start()`
  in `server.ts`) is the correct mechanism. No external scheduler, no distributed lease.
- **No ADR required.** A distributed lease (DB advisory lock / leader election) is only
  mandatory under Gate 3 (multiple replicas each running the in-process scheduler), which
  does not apply here.
- Increment **B.1 is production-ready** under this deployment model.

**Upgrade path (if you ever scale to multiple replicas):** before adding a second replica,
either (2) run reconciliation from an external scheduler with `concurrency=1` and disable
the in-process scheduler, or (3) open an ADR for a distributed lease. Correctness is not at
risk either way (`PostingService.postEntry` is idempotent on
`@@unique([userId, unitId, sourceType, sourceId])`), but the process-local lock would no
longer prevent duplicate *work*. See `docs/runbooks/accounting-sync-reconciliation.md`.
