import type { ReferentialMapping, Prisma } from 'generated/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import type { IReferentialMappingRepository } from '../repositories/IReferentialMappingRepository';
import type { IReferentialAccountRepository } from '../repositories/IReferentialAccountRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import type { AuditService } from './AuditService';
import type {
  SetReferentialMappingDto,
  UnsetReferentialMappingDto,
  BatchSetReferentialMappingDto,
  CopyReferentialMappingDto,
} from '../dtos/ReferentialMappingDto';

/** One leaf account missing a referential mapping in the queried version. */
export interface UnmappedReferentialAccount {
  accountId: string;
  code: string;
  name: string;
  nature: string;
}

/**
 * Chart-driven authoring skeleton (BE-INCR-9B Track A, fork D5): the unmapped leaf
 * set of a version re-exposed as a fill-in-the-blanks batch template. Pure reuse of
 * `coverage().unmappedAccounts` — no independent chart re-query, no invented RFB codes.
 */
export interface ReferentialAuthoringSkeleton {
  unitId: string;
  mappingVersion: string;
  /** Active leaf accounts still needing a referentialCode/label authored in this version. */
  items: UnmappedReferentialAccount[];
}

/**
 * Coverage diagnostic for a referential-layout version — the ECD-readiness gate.
 * Mirrors the SHAPE of AccountingReportService's DiagnosticsShape (mappingVersion +
 * unmappedAccounts[]), NOT its content: this is chart-completeness, not a money report.
 */
export interface ReferentialCoverageReport {
  unitId: string;
  mappingVersion: string;
  /** Active leaf accounts (acceptsEntries) with no mapping in this version. */
  unmappedAccounts: UnmappedReferentialAccount[];
  totals: {
    /** Active leaf accounts in the chart (the ECD mapping universe). */
    leafAccountCount: number;
    mappedCount: number;
    unmappedCount: number;
  };
  /** true when every active leaf account is mapped in this version — ready for ECD. */
  ready: boolean;
}

/**
 * ReferentialMappingService — versioned chart-of-accounts → RFB referential
 * mapping (BE-INCR-9 / ADR-INCR9), FIRST-CLASS PRISMA.
 *
 * Changes NO ledger value — it writes/reads the mapping table and reads the chart.
 * Every write runs inside repo.runTransaction with the account-liveness gate
 * re-checked in-tx (ACC-011: the account may be soft-deleted concurrently) and the
 * audit appended in the SAME tx (ACC-019). The coverage read is read-only,
 * deterministic and CHART-driven (never gated on postings) — a zero-balance leaf
 * still needs a referential code for ECD (D3).
 */
export class ReferentialMappingService {
  constructor(
    private readonly repo: IReferentialMappingRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly policy: IAccountingPolicy,
    private readonly audit: AuditService,
    // BE-INCR-9B Track B: the RFB referential CATALOG, for destination validation (D3) + label
    // snapshot (D9). GLOBAL/no-tenancy read only; changes no ledger value.
    private readonly catalogRepo: IReferentialAccountRepository,
  ) {}

  /**
   * Set (upsert) the referential mapping of one leaf account in one version. Gate
   * in-tx: the account must be alive (deletedAt: null — findById filters it) AND a
   * leaf (acceptsEntries) AND in scope; the @@unique makes re-set idempotent
   * (update-in-place). Audit appended in the same tx.
   */
  async setMapping(
    scope: AccountingScope,
    dto: SetReferentialMappingDto,
  ): Promise<ReferentialMapping> {
    if (!this.policy.canManageReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerenciar o plano referencial.');
    }

    return this.repo.runTransaction((tx) => this.applySet(tx, scope, dto));
  }

  /**
   * Batch (upsert) many leaf-account mappings in ONE version, atomically (fork D8):
   * every item runs in a SINGLE runTransaction, so one bad item rolls the whole batch
   * back. Per item the account-liveness + leaf gate is re-checked INSIDE the tx
   * (ACC-011) and the audit appended in the same tx (ACC-019), via the shared
   * `applySet` — the exact per-item set gate. Duplicate accountId is rejected upstream
   * by the DTO refine (no ambiguous last-wins).
   */
  async batchSet(
    scope: AccountingScope,
    dto: BatchSetReferentialMappingDto,
  ): Promise<ReferentialMapping[]> {
    if (!this.policy.canManageReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerenciar o plano referencial.');
    }

    return this.repo.runTransaction(async (tx) => {
      const results: ReferentialMapping[] = [];
      for (const item of dto.items) {
        results.push(
          await this.applySet(tx, scope, {
            accountId: item.accountId,
            referentialCode: item.referentialCode,
            label: item.label,
            mappingVersion: dto.mappingVersion,
          }),
        );
      }
      return results;
    });
  }

  /**
   * Copy every mapping of `fromVersion` into `toVersion` in ONE tx ("year
   * inheritance", fork D6). The source `label` is passed through, but `applySet` re-resolves it
   * against the TO-version catalog (D9): if that version's catalog is loaded, the destination code
   * is re-validated (analytic + exists) and the label re-snapshotted from the catalog; if not
   * loaded, the source label is copied literally (INCR-9 behavior). Reuses the per-item set gate
   * via `applySet`, so a source account since soft-deleted / turned into a grouping account — or a
   * code no longer valid in the to-version catalog — aborts the whole copy (all-or-nothing). The
   * @@unique includes mappingVersion, so an existing target row is upserted-in-place, never P2002.
   */
  async copyVersion(
    scope: AccountingScope,
    dto: CopyReferentialMappingDto,
  ): Promise<ReferentialMapping[]> {
    if (!this.policy.canManageReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerenciar o plano referencial.');
    }

    return this.repo.runTransaction(async (tx) => {
      const source = await this.repo.findManyByVersion(scope, dto.fromVersion, tx);
      if (source.length === 0) {
        throw new NotFoundError(
          `Nenhum mapeamento referencial na versão de origem "${dto.fromVersion}".`,
        );
      }
      const results: ReferentialMapping[] = [];
      for (const src of source) {
        results.push(
          await this.applySet(tx, scope, {
            accountId: src.accountId,
            referentialCode: src.referentialCode,
            label: src.label, // re-snapshot literally (D9)
            mappingVersion: dto.toVersion,
          }),
        );
      }
      return results;
    });
  }

  /**
   * The per-item set gate + write + in-tx audit, shared by setMapping / batchSet /
   * copyVersion. MUST run inside a caller-owned tx: the account is re-read with the tx
   * handle (ACC-011), the mapping upserted with the tx handle, and the audit appended
   * with the same handle (ACC-019) — every write receives `tx` so the atomicity is real.
   */
  private async applySet(
    tx: Prisma.TransactionClient,
    scope: AccountingScope,
    item: { accountId: string; referentialCode: string; label: string; mappingVersion: string },
  ): Promise<ReferentialMapping> {
    // Gate (ACC-011): re-read the account INSIDE the tx — deletedAt/acceptsEntries are
    // mutable; a concurrent softDelete must not interleave under a stale preflight.
    const account = await this.accountRepo.findById(scope, item.accountId, tx);
    if (!account) {
      // Cross-tenant/id inexistente/soft-deleted = NotFound (anti-enumeração).
      throw new NotFoundError('Conta contábil não encontrada.');
    }
    if (!account.acceptsEntries) {
      throw new ValidationError(
        'Só contas-folha (acceptsEntries) recebem mapeamento referencial.',
      );
    }

    // Destination gate (BE-INCR-9B Track B, D3/D9): validate the RFB code against the CATALOG of
    // this layout version and snapshot the authoritative label. CONDITIONAL on catalog presence —
    // an unimported version keeps the INCR-9 free-string behavior (nothing to validate against;
    // I052 — never invent the layout). The label is snapshotted from the catalog when available,
    // else the caller's label (still a per-version denormalized snapshot).
    const catalogLabel = await this.resolveDestinationLabel(
      tx,
      item.mappingVersion,
      item.referentialCode,
    );
    const label = catalogLabel ?? item.label;

    const mapping = await this.repo.upsert(
      scope,
      {
        accountId: item.accountId,
        referentialCode: item.referentialCode,
        label,
        mappingVersion: item.mappingVersion,
        createdById: scope.actorUserId,
      },
      tx,
    );

    await this.audit.append(tx, scope, {
      actorUserId: scope.actorUserId,
      eventType: 'referential.mapping.set',
      targetType: 'ReferentialMapping',
      targetId: mapping.id,
      payload: {
        accountId: item.accountId,
        referentialCode: item.referentialCode,
        mappingVersion: item.mappingVersion,
      },
    });

    return mapping;
  }

  /**
   * Destination validation + label snapshot (BE-INCR-9B Track B, D3/D9). CONDITIONAL on catalog
   * presence for the layout version (default D7: layoutVersion == mappingVersion):
   *  - catalog HAS this code → it MUST be analytic (a leaf of the referential plan) — a synthetic
   *    destination is rejected (RFB rule: you never map to a grouping referential account). Returns
   *    the catalog's official name to snapshot as the label (authoritative — D9).
   *  - catalog LOADED but code absent → the code is not a real RFB account for this version → reject.
   *  - catalog NOT loaded for this version (0 rows) → return null: fall back to the INCR-9 free-string
   *    destination (nothing to validate against; I052 — never invent which codes are analytic).
   * Reads use the same tx handle as the account gate (ACC-012 consistency). The catalog is global
   * reference data — this read changes no ledger value.
   */
  private async resolveDestinationLabel(
    tx: Prisma.TransactionClient,
    mappingVersion: string,
    referentialCode: string,
  ): Promise<string | null> {
    const account = await this.catalogRepo.findByVersionAndCode(mappingVersion, referentialCode, tx);
    if (account) {
      if (!account.isAnalytic) {
        throw new ValidationError(
          `A conta referencial "${referentialCode}" é sintética na versão "${mappingVersion}"; ` +
            'só contas referenciais analíticas (folha) são destino válido do de-para.',
        );
      }
      return account.name; // snapshot the authoritative catalog label (D9).
    }
    // Code not in the catalog: reject only if a catalog for this version WAS imported.
    const catalogLoaded = (await this.catalogRepo.countByVersion(mappingVersion, tx)) > 0;
    if (catalogLoaded) {
      throw new ValidationError(
        `A conta referencial "${referentialCode}" não existe no catálogo da versão "${mappingVersion}".`,
      );
    }
    return null; // no catalog for this version → INCR-9 free-string behavior.
  }

  /**
   * Unset (hard-delete) the mapping of one account in one version. The change trail
   * lives in AuditEvent (D5) — appended in the same tx as the delete.
   */
  async unsetMapping(scope: AccountingScope, dto: UnsetReferentialMappingDto): Promise<void> {
    if (!this.policy.canManageReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerenciar o plano referencial.');
    }

    await this.repo.runTransaction(async (tx) => {
      const existing = await this.repo.findByAccountAndVersion(
        scope,
        dto.accountId,
        dto.mappingVersion,
        tx,
      );
      if (!existing) {
        throw new NotFoundError('Mapeamento referencial não encontrado.');
      }
      await this.repo.deleteByAccountVersion(scope, dto.accountId, dto.mappingVersion, tx);
      await this.audit.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'referential.mapping.unset',
        targetType: 'ReferentialMapping',
        targetId: existing.id,
        payload: {
          accountId: dto.accountId,
          referentialCode: existing.referentialCode,
          mappingVersion: dto.mappingVersion,
        },
      });
    });
  }

  /** Lists all referential mappings of a version within the scope. */
  async listMappings(scope: AccountingScope, version: string): Promise<ReferentialMapping[]> {
    if (!this.policy.canReadReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o plano referencial.');
    }
    return this.repo.findManyByVersion(scope, version);
  }

  /**
   * Coverage diagnostic (ECD-readiness gate) for a version. CHART-driven: the
   * universe is the active leaf accounts (accountRepo.findManyByUnit already filters
   * deletedAt: null and orders by code), MINUS the accounts mapped in this version.
   * Read-only, no tx, no posting gate — a zero-movement leaf still must be mapped (D3).
   */
  async coverage(scope: AccountingScope, version: string): Promise<ReferentialCoverageReport> {
    if (!this.policy.canReadReferential(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o plano referencial.');
    }

    const accounts = await this.accountRepo.findManyByUnit(scope);
    const leafAccounts = accounts.filter((a) => a.acceptsEntries);

    const mappings = await this.repo.findManyByVersion(scope, version);
    const mappedIds = new Set(mappings.map((m) => m.accountId));

    const unmappedAccounts: UnmappedReferentialAccount[] = leafAccounts
      .filter((a) => !mappedIds.has(a.id))
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, nature: a.nature }));

    const mappedCount = leafAccounts.length - unmappedAccounts.length;

    return {
      unitId: scope.unitId,
      mappingVersion: version,
      unmappedAccounts,
      totals: {
        leafAccountCount: leafAccounts.length,
        mappedCount,
        unmappedCount: unmappedAccounts.length,
      },
      ready: unmappedAccounts.length === 0,
    };
  }

  /**
   * Authoring skeleton (fork D5): the unmapped leaf accounts of a version, shaped as a
   * fill-in-the-blanks template for batch authoring. Pure reuse of
   * `coverage().unmappedAccounts` — it inherits coverage's read gate and CHART-driven
   * universe, and NEVER invents an RFB code (D1/D10: codes are human-supplied input).
   */
  async authoringSkeleton(
    scope: AccountingScope,
    version: string,
  ): Promise<ReferentialAuthoringSkeleton> {
    const report = await this.coverage(scope, version);
    return {
      unitId: report.unitId,
      mappingVersion: report.mappingVersion,
      items: report.unmappedAccounts,
    };
  }
}
