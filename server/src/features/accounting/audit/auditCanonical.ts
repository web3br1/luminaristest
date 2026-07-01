import { createHash } from 'crypto';

export const GENESIS_HASH = '0'.repeat(64);
export const HASH_VERSION = 1;
export const CANONICAL_VERSION = 1;

/**
 * Allowlisted payload fields per eventType.
 * Only these keys survive sanitization — everything else (tokens, PII, request body) is dropped.
 * Money values must be strings (never numbers) before calling this.
 */
const PAYLOAD_ALLOWLIST: Record<string, readonly string[]> = {
  'entry.posted':    ['sourceType', 'sourceId', 'description', 'sumDebitCents', 'lineCount'],
  'entry.reversed':  ['originalId', 'reversalId', 'reason'],
  'account.created': ['code', 'name', 'nature', 'acceptsEntries'],
  'account.deleted': ['code'],
  'period.opened':      ['year', 'month', 'fromStatus', 'toStatus'],
  'period.soft_closed': ['year', 'month', 'fromStatus', 'toStatus', 'reason'],
  'period.hard_closed': ['year', 'month', 'fromStatus', 'toStatus', 'reason'],
  'period.reopened':    ['year', 'month', 'fromStatus', 'toStatus', 'reason'],
  // BE-INCR-5 — document attachments. No file path, filename, or raw content (PII-safe).
  'attachment.uploaded':   ['journalEntryId', 'mimeType', 'sizeBytes', 'sha256'],
  'attachment.deleted':    ['journalEntryId', 'mimeType', 'sizeBytes', 'sha256', 'deletedById'],
  'attachment.downloaded': ['journalEntryId', 'mimeType', 'sizeBytes', 'sha256'],
};

/**
 * Sanitize a raw payload object for a given eventType.
 * - Only allowlisted keys survive.
 * - BigInt values are converted to string.
 * - Undefined values are dropped.
 * Returns a stable JSON string (keys sorted).
 */
export function canonicalizeAuditPayload(eventType: string, raw: Record<string, unknown>): string {
  const allowed = PAYLOAD_ALLOWLIST[eventType];
  if (!allowed) {
    throw new Error(`[audit] unknown eventType for canonicalization: ${eventType}`);
  }
  const filtered: Record<string, string> = {};
  for (const key of allowed) {
    const v = raw[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'bigint') {
      filtered[key] = v.toString();
    } else {
      filtered[key] = String(v);
    }
  }
  // Sort keys for determinism.
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(filtered).sort()) {
    sorted[k] = filtered[k];
  }
  return JSON.stringify(sorted);
}

export interface AuditTupleInput {
  eventId:          string;
  scopeUserId:      string;
  unitId:           string;
  seq:              bigint;
  actorUserId:      string | null;
  actorType:        string;
  eventType:        string;
  targetType:       string;
  targetId:         string;
  payloadCanonical: string;
  createdAtISO:     string;
  prevHash:         string;
}

/**
 * Build the versionated canonical tuple that feeds the hash.
 * Must be deterministic: same inputs → same JSON string → same sha256.
 */
export function buildAuditCanonicalTuple(input: AuditTupleInput): string {
  const tuple = {
    v:                'audit.v1',
    eventId:          input.eventId,
    scopeUserId:      input.scopeUserId,
    unitId:           input.unitId,
    seq:              input.seq.toString(),
    actorUserId:      input.actorUserId,
    actorType:        input.actorType,
    eventType:        input.eventType,
    targetType:       input.targetType,
    targetId:         input.targetId,
    payloadCanonical: input.payloadCanonical,
    createdAtISO:     input.createdAtISO,
    prevHash:         input.prevHash,
  };
  return JSON.stringify(tuple);
}

/** sha256 of the canonical tuple string (hex, 64 chars). */
export function hashAuditCanonical(canonicalTupleJson: string): string {
  return createHash('sha256').update(canonicalTupleJson, 'utf8').digest('hex');
}
