import type { ReferentialMapping } from 'generated/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import type { IReferentialMappingRepository } from '../repositories/IReferentialMappingRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import type { AuditService } from './AuditService';
import type {
  SetReferentialMappingDto,
  UnsetReferentialMappingDto,
} from '../dtos/ReferentialMappingDto';

/** One leaf account missing a referential mapping in the queried version. */
export interface UnmappedReferentialAccount {
  accountId: string;
  code: string;
  name: string;
  nature: string;
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

    return this.repo.runTransaction(async (tx) => {
      // Gate (ACC-011): re-read the account INSIDE the tx — deletedAt/acceptsEntries are
      // mutable; a concurrent softDelete must not interleave under a stale preflight.
      const account = await this.accountRepo.findById(scope, dto.accountId, tx);
      if (!account) {
        // Cross-tenant/id inexistente/soft-deleted = NotFound (anti-enumeração).
        throw new NotFoundError('Conta contábil não encontrada.');
      }
      if (!account.acceptsEntries) {
        throw new ValidationError(
          'Só contas-folha (acceptsEntries) recebem mapeamento referencial.',
        );
      }

      const mapping = await this.repo.upsert(
        scope,
        {
          accountId: dto.accountId,
          referentialCode: dto.referentialCode,
          label: dto.label,
          mappingVersion: dto.mappingVersion,
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
          accountId: dto.accountId,
          referentialCode: dto.referentialCode,
          mappingVersion: dto.mappingVersion,
        },
      });

      return mapping;
    });
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
}
