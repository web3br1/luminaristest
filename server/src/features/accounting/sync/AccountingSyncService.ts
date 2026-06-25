import { Prisma } from 'generated/prisma';
import { ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { PostingService } from '../services/PostingService';
import type { AccountingScope } from '../scope/AccountingScope';
import type { AccountingEvent, AccountingSyncPort, SyncResult } from './AccountingSyncPort';
import type { IAccountingEventMapper } from './mappers/IAccountingEventMapper';

/** Transient DB errors worth retrying (SQLite busy / connection / tx timeout). */
function isTransientDbError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2024 = timed out fetching a connection from the pool; P1xxx = connection layer.
    return ['P2024', 'P1000', 'P1001', 'P1002', 'P1008', 'P1017'].includes(error.code);
  }
  if (error instanceof Error && /SQLITE_BUSY|database is locked|timed out/i.test(error.message)) {
    return true;
  }
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AccountingSyncService — application-level adapter that books journal entries for
 * domain events. It is the FIRST non-controller consumer of PostingService and is
 * legitimate precisely because it is an integration service (not the DynamicTable
 * engine). §2.1: it must never be injected into DynamicTableService/RuleContext/
 * RulePlugin, and must be invoked POST-COMMIT (never inside another tx).
 *
 * Idempotency is delegated ENTIRELY to PostingService (read-side findBySource +
 * write-side P2002 race-close on @@unique([userId,unitId,sourceType,sourceId])).
 * This service intentionally has NO idempotency pre-check of its own — that would
 * be a TOCTOU; postEntry is the single authority.
 */
export class AccountingSyncService implements AccountingSyncPort {
  private readonly mappers: Map<string, IAccountingEventMapper>;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly postingService: PostingService,
    mappers: IAccountingEventMapper[],
    opts: { maxAttempts?: number; retryDelayMs?: number } = {},
  ) {
    this.mappers = new Map(mappers.map((m) => [m.sourceType, m]));
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 50;
  }

  async sync(scope: AccountingScope, event: AccountingEvent): Promise<SyncResult> {
    const mapper = this.mappers.get(event.sourceType);
    if (!mapper) {
      // Invalid/unknown event kind: a wiring error, not a transient fault. Surface it.
      throw new ValidationError(`Nenhum mapper registrado para o evento '${event.sourceType}'.`);
    }

    // map() may throw ValidationError (bad money / unbalanced source) — NOT retried.
    const input = mapper.map(event);

    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        // postEntry owns the balance invariant, atomicity AND idempotency.
        const entry = await this.postingService.postEntry(scope, input);
        return { entryId: entry.id };
      } catch (error) {
        // ValidationError (and any non-transient fault) is deterministic — do not retry.
        if (error instanceof ValidationError || !isTransientDbError(error)) {
          throw error;
        }
        lastError = error;
        logger.warn('AccountingSync transient failure — will retry', {
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          attempt,
          maxAttempts: this.maxAttempts,
        });
        if (attempt < this.maxAttempts) await sleep(this.retryDelayMs);
      }
    }

    // Retries exhausted: no partial write (postEntry is atomic per attempt). The
    // source fact stands; the reconciliation job will re-drive this idempotently.
    logger.error('AccountingSync exhausted retries — left for reconciliation', {
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    throw lastError;
  }
}
