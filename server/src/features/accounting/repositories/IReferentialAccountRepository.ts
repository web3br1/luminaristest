import type { ReferentialAccount, Prisma } from 'generated/prisma';

/** Input for upserting one referential-catalog account (idempotent on [layoutVersion, code]). */
export interface ReferentialAccountInput {
  layoutVersion: string;
  code: string;
  name: string;
  isAnalytic: boolean;
  parentCode: string | null;
}

/** Filter for the lookup/picker read (BE-INCR-9B Track B). */
export interface ReferentialCatalogQuery {
  /** Substring match on code OR name (case-insensitive-ish; SQLite `contains`). */
  q?: string;
  /** When true, only analytic (leaf) accounts — the valid mapping destinations (D3). */
  analyticOnly?: boolean;
}

/**
 * Contract for the RFB referential CATALOG (`referential_accounts`) — BE-INCR-9B / ADR-INCR9B
 * Track B. First-class Prisma (NOT DynamicTable). GLOBAL reference data: NO AccountingScope
 * (the official layout is the same for every tenant — D4). Only place with
 * prisma.referentialAccount.* access. NO soft-delete (re-import is upsert-in-place on the
 * @@unique[layoutVersion,code], so no soft-delete×@@unique class bug). Reads that back the
 * destination-validation gate accept a tx handle so the mapping service can read the catalog
 * with the same handle as its in-tx account gate (ACC-012 consistency).
 */
export interface IReferentialAccountRepository {
  /**
   * Upserts one catalog account, idempotent on [layoutVersion, code]: an existing row is
   * updated (name/isAnalytic/parentCode refreshed from the re-imported file), a new pair is
   * created. Never a create-only insert — re-import of the same layout must not P2002.
   */
  upsert(
    data: ReferentialAccountInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialAccount>;

  /** Finds the catalog account (layoutVersion, code), or null. Backs destination validation. */
  findByVersionAndCode(
    layoutVersion: string,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialAccount | null>;

  /**
   * Counts catalog rows of a layout version. Backs the PRESENCE check (D3): a version with 0
   * rows is "catalog not imported" → destination validation falls back to INCR-9 free-string.
   */
  countByVersion(layoutVersion: string, tx?: Prisma.TransactionClient): Promise<number>;

  /** Lists a version's catalog rows for the lookup/picker, ordered by code (optional filter). */
  findManyByVersion(
    layoutVersion: string,
    query?: ReferentialCatalogQuery,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialAccount[]>;

  /** Runs fn inside a DB transaction (the import upserts every row atomically). */
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
