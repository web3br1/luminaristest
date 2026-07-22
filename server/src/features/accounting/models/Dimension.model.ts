/**
 * Dimension domain constants (Dimensões — centro de custo/projeto, INCR-DIM / ADR-INCR-DIM). The
 * Prisma row types (`DimensionDefinition`, `DimensionValue`, `PostingDimension`) come from
 * `generated/prisma`; this file owns the enum-like unions and the audit event keys.
 *
 * A dimension is METADATA on a posting leg, ORTHOGONAL to the chart of accounts — it NEVER enters
 * Σdébito=Σcrédito, the period gate, numbering, idempotency or the audit hash-chain (invariant
 * ACC-024). The catalog is first-class Prisma (F1→a): a definition is an AXIS (cost center, project),
 * a value is a node in that axis's hierarchy (parentId rollup), and PostingDimension is the bridge.
 */

/** Lifecycle for both a definition (axis) and a value. ARCHIVED is a soft-remove (status + deletedAt). */
export const DIMENSION_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type DimensionStatus = (typeof DIMENSION_STATUSES)[number];

/**
 * Audit event keys for catalog management (T8 — every state change is auditable). The ledger is
 * untouched by dimensions, so these are the ONLY new audit events; tagging happens inside the
 * entry's own `entry.posted` event, not a separate one (ACC-024 — the tag is not a ledger fact).
 */
export const DIMENSION_DEFINITION_CREATED = 'dimension.definition_created';
export const DIMENSION_DEFINITION_ARCHIVED = 'dimension.definition_archived';
export const DIMENSION_VALUE_CREATED = 'dimension.value_created';
export const DIMENSION_VALUE_ARCHIVED = 'dimension.value_archived';
