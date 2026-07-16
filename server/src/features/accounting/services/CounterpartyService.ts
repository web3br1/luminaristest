import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import { Prisma } from 'generated/prisma';
import type { Counterparty } from 'generated/prisma';
import {
  COUNTERPARTY_ARCHIVED,
  COUNTERPARTY_CREATED,
  deletedCounterpartyName,
} from '../models/Counterparty.model';
import type {
  ArchiveCounterpartyInput,
  CreateCounterpartyInput,
  ListCounterpartiesQueryInput,
} from '../dtos/CounterpartyDto';
import type { ICounterpartyRepository } from '../repositories/ICounterpartyRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AuditService } from './AuditService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/**
 * CounterpartyService — supplier/customer catalog (INCR-COUNTERPARTY / A1). FIRST-CLASS PRISMA. Pure
 * catalog CRUD (create/list/get/archive): it manages the counterparty IDENTITY that the AP/AR
 * subledger links to by FK; it NEVER posts to the ledger (a counterparty is metadata, not a ledger
 * value). The AP/AR create paths resolve a body-supplied counterpartyId through
 * `counterpartyRepo.findById(scope, id)` RE-SCOPED (SEC-A1-1), so this service owns the only scoped
 * catalog reads/writes.
 *
 * Invariants proved here:
 * - SEC-A1-2: the business key is `[userId, unitId, type, name]` (dedupe per SCOPE) — a P2002 maps to
 *   a ValidationError, never a raw crash. Two tenants named "ACME" are two distinct rows.
 * - SEC-A1-4: archive is soft (deletedAt + rename-on-key `name → deleted:<id>:<name>`) so the unique
 *   key is freed and an archive+recreate of the same name never trips P2002. Historical AP/AR links
 *   stay intact (the FK id is stable; the mangled name lives only on the archived row).
 * - Every catalog state change emits an AuditEvent in the SAME tx (T8).
 */
export class CounterpartyService {
  constructor(
    private readonly counterpartyRepo: ICounterpartyRepository,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
  ) {}

  // ── Reads ──────────────────────────────────────────────────────────────────
  async listCounterparties(
    scope: AccountingScope,
    params: ListCounterpartiesQueryInput,
  ): Promise<Counterparty[]> {
    if (!this.policy.canReadCounterparty(scope)) {
      throw new ForbiddenError('Você não tem permissão para listar contrapartes.');
    }
    return this.counterpartyRepo.findManyByUnit(scope, {
      type: params.type,
      includeArchived: params.includeArchived,
    });
  }

  async getCounterparty(scope: AccountingScope, id: string): Promise<Counterparty> {
    if (!this.policy.canReadCounterparty(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler contrapartes.');
    }
    const counterparty = await this.counterpartyRepo.findById(scope, id);
    if (!counterparty) throw new NotFoundError(`Contraparte '${id}' não foi encontrada.`);
    return counterparty;
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async createCounterparty(scope: AccountingScope, dto: CreateCounterpartyInput): Promise<Counterparty> {
    if (!this.policy.canManageCounterparty(scope)) {
      throw new ForbiddenError('Você não tem permissão para criar contrapartes.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);
    try {
      return await this.counterpartyRepo.runTransaction(async (tx) => {
        const created = await this.counterpartyRepo.create(
          {
            userId,
            unitId,
            type: dto.type,
            name: dto.name,
            ref: dto.ref ?? null,
            createdById: scope.actorUserId,
          },
          tx,
        );
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: COUNTERPARTY_CREATED,
          targetType: 'counterparty',
          targetId: created.id,
          payload: { counterpartyId: created.id, type: created.type, name: created.name, ref: created.ref },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(
          `Já existe uma contraparte ${dto.type === 'CUSTOMER' ? 'cliente' : 'fornecedor'} com o nome '${dto.name}' nesta unidade.`,
        );
      }
      throw error;
    }
  }

  // ── Archive ────────────────────────────────────────────────────────────────
  /**
   * Archive a counterparty: soft-delete (deletedAt) + rename-on-key so the name is freed for reuse
   * (SEC-A1-4). Idempotent — archiving an already-archived counterparty returns it unchanged. The AP/
   * AR rows that reference it keep their own name snapshot and their stable counterpartyId link.
   */
  async archiveCounterparty(
    scope: AccountingScope,
    id: string,
    _dto: ArchiveCounterpartyInput,
  ): Promise<Counterparty> {
    if (!this.policy.canManageCounterparty(scope)) {
      throw new ForbiddenError('Você não tem permissão para arquivar contrapartes.');
    }
    const counterparty = await this.counterpartyRepo.findById(scope, id);
    if (!counterparty) throw new NotFoundError(`Contraparte '${id}' não foi encontrada.`);
    if (counterparty.deletedAt) return counterparty; // idempotent

    return this.counterpartyRepo.runTransaction(async (tx) => {
      const archived = await this.counterpartyRepo.update(
        scope,
        id,
        { deletedAt: new Date(), name: deletedCounterpartyName(id, counterparty.name) },
        tx,
      );
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: COUNTERPARTY_ARCHIVED,
        targetType: 'counterparty',
        targetId: id,
        payload: { counterpartyId: id, type: counterparty.type, name: counterparty.name },
      });
      return archived;
    });
  }
}
