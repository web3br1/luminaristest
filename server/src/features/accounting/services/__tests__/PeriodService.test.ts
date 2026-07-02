/**
 * PeriodService — accounting period state machine.
 *
 * Tests cover:
 *  (a) legal state transitions: FUTURE→OPEN, OPEN→SOFT_CLOSED, OPEN/SOFT_CLOSED→HARD_CLOSED, SOFT_CLOSED→OPEN
 *  (b) terminal guard: HARD_CLOSED cannot reopen
 *  (c) ForbiddenError when policy.canClosePeriod is false
 *  (d) NotFound/ValidationError on invalid periodId or illegal transition
 *  (e) seedYear delegates to repo inside a tx
 *  (f) listPeriods delegates to repo.list; ForbiddenError when canRead is false
 */
import { PeriodService } from '../PeriodService';
import { ForbiddenError, ValidationError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

function makePeriod(status: string, year = 2026, month = 6) {
  return { id: 'p-1', userId: 'u1', unitId: 'unit-1', year, month, status };
}

function buildService(over: { periodRepo?: any; policy?: any; postingRepo?: any; auditService?: any } = {}) {
  const periodRepo = {
    findById: jest.fn(async () => makePeriod('OPEN')),
    findByYearMonth: jest.fn(async () => makePeriod('OPEN')),
    seedYear: jest.fn(async () => Array.from({ length: 12 }, (_, i) => makePeriod('FUTURE', 2026, i + 1))),
    setStatus: jest.fn(async (_scope: any, _y: any, _m: any, status: string) => makePeriod(status)),
    list: jest.fn(async () => [makePeriod('OPEN')]),
    ...over.periodRepo,
  };

  const policy = {
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canRead: jest.fn(() => true),
    canClosePeriod: jest.fn(() => true),
    ...over.policy,
  };

  // runTransaction runs the callback immediately (no real tx needed).
  const postingRepo = {
    runTransaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn({})),
    ...over.postingRepo,
  };

  const auditService = { append: jest.fn(async () => {}), ...over.auditService };
  const svc = new PeriodService(periodRepo as any, policy as any, postingRepo as any, auditService as any);
  return { svc, periodRepo, policy, postingRepo };
}

describe('PeriodService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('seedYear', () => {
    it('seeds 12 FUTURE periods inside a tx and returns them', async () => {
      const { svc, periodRepo, postingRepo } = buildService();
      const result = await svc.seedYear(scope, 2026);
      expect(postingRepo.runTransaction).toHaveBeenCalledTimes(1);
      expect(periodRepo.seedYear).toHaveBeenCalledWith(scope, 2026, {});
      expect(result).toHaveLength(12);
    });

    it('throws ForbiddenError when canClosePeriod is false', async () => {
      const { svc } = buildService({ policy: { canClosePeriod: jest.fn(() => false) } });
      await expect(svc.seedYear(scope, 2026)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('openPeriod', () => {
    it('opens a FUTURE period → OPEN', async () => {
      const { svc, periodRepo } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('FUTURE')) },
      });
      const result = await svc.openPeriod(scope, 'p-1');
      expect(periodRepo.setStatus).toHaveBeenCalledWith(scope, 2026, 6, 'OPEN', 'u1', undefined, {}, 'FUTURE');
      expect(result.status).toBe('OPEN');
    });

    it('opens a SOFT_CLOSED period → OPEN', async () => {
      const { svc, periodRepo } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('SOFT_CLOSED')) },
      });
      await svc.openPeriod(scope, 'p-1');
      expect(periodRepo.setStatus).toHaveBeenCalledWith(scope, 2026, 6, 'OPEN', 'u1', undefined, {}, 'SOFT_CLOSED');
    });

    it('throws ValidationError when period is already OPEN', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('OPEN')) },
      });
      await expect(svc.openPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when period is HARD_CLOSED', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('HARD_CLOSED')) },
      });
      await expect(svc.openPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when period is not found', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => null) },
      });
      await expect(svc.openPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ForbiddenError when canClosePeriod is false', async () => {
      const { svc } = buildService({ policy: { canClosePeriod: jest.fn(() => false) } });
      await expect(svc.openPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('softClosePeriod', () => {
    it('soft-closes an OPEN period → SOFT_CLOSED', async () => {
      const { svc, periodRepo } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('OPEN')) },
      });
      const result = await svc.softClosePeriod(scope, 'p-1', 'Fim do mês');
      expect(periodRepo.setStatus).toHaveBeenCalledWith(scope, 2026, 6, 'SOFT_CLOSED', 'u1', 'Fim do mês', {}, 'OPEN');
      expect(result.status).toBe('SOFT_CLOSED');
    });

    it('throws ValidationError when period is not OPEN', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('FUTURE')) },
      });
      await expect(svc.softClosePeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when period is not found', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => null) },
      });
      await expect(svc.softClosePeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('hardClosePeriod', () => {
    it('hard-closes an OPEN period → HARD_CLOSED', async () => {
      const { svc, periodRepo } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('OPEN')) },
      });
      await svc.hardClosePeriod(scope, 'p-1', 'Auditoria');
      expect(periodRepo.setStatus).toHaveBeenCalledWith(scope, 2026, 6, 'HARD_CLOSED', 'u1', 'Auditoria', {}, 'OPEN');
    });

    it('hard-closes a SOFT_CLOSED period → HARD_CLOSED', async () => {
      const { svc, periodRepo } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('SOFT_CLOSED')) },
      });
      await svc.hardClosePeriod(scope, 'p-1');
      expect(periodRepo.setStatus).toHaveBeenCalledWith(scope, 2026, 6, 'HARD_CLOSED', 'u1', undefined, {}, 'SOFT_CLOSED');
    });

    it('throws ValidationError when period is FUTURE (illegal)', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('FUTURE')) },
      });
      await expect(svc.hardClosePeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when period is not found', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => null) },
      });
      await expect(svc.hardClosePeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('reopenPeriod', () => {
    it('reopens a SOFT_CLOSED period → OPEN', async () => {
      const { svc, periodRepo } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('SOFT_CLOSED')) },
      });
      await svc.reopenPeriod(scope, 'p-1', 'Correcão');
      expect(periodRepo.setStatus).toHaveBeenCalledWith(scope, 2026, 6, 'OPEN', 'u1', 'Correcão', {}, 'SOFT_CLOSED');
    });

    it('throws ValidationError (terminal) when period is HARD_CLOSED', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('HARD_CLOSED')) },
      });
      await expect(svc.reopenPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when period is OPEN (not SOFT_CLOSED)', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('OPEN')) },
      });
      await expect(svc.reopenPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('throws ValidationError when period is not found', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => null) },
      });
      await expect(svc.reopenPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('listPeriods', () => {
    it('delegates to repo.list and returns periods', async () => {
      const { svc, periodRepo } = buildService();
      const result = await svc.listPeriods(scope, 2026);
      expect(periodRepo.list).toHaveBeenCalledWith(scope, 2026);
      expect(result).toHaveLength(1);
    });

    it('throws ForbiddenError when canRead is false', async () => {
      const { svc } = buildService({ policy: { canRead: jest.fn(() => false) } });
      await expect(svc.listPeriods(scope, 2026)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('INCR-2 audit wiring', () => {
    it('openPeriod emits period.opened with fromStatus/toStatus', async () => {
      const auditSpy = jest.fn(async () => {});
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('FUTURE')) },
        auditService: { append: auditSpy },
      });
      await svc.openPeriod(scope, 'p-1');
      expect(auditSpy).toHaveBeenCalledTimes(1);
      expect((auditSpy.mock.calls as any[])[0][2]).toMatchObject({
        eventType: 'period.opened',
        targetType: 'accounting_period',
        payload:    expect.objectContaining({ fromStatus: 'FUTURE', toStatus: 'OPEN' }),
      });
    });

    it('softClosePeriod emits period.soft_closed', async () => {
      const auditSpy = jest.fn(async () => {});
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('OPEN')) },
        auditService: { append: auditSpy },
      });
      await svc.softClosePeriod(scope, 'p-1', 'Fim do mês');
      expect((auditSpy.mock.calls as any[])[0][2]).toMatchObject({
        eventType: 'period.soft_closed',
        payload:    expect.objectContaining({ fromStatus: 'OPEN', toStatus: 'SOFT_CLOSED' }),
      });
    });

    it('hardClosePeriod emits period.hard_closed', async () => {
      const auditSpy = jest.fn(async () => {});
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('OPEN')) },
        auditService: { append: auditSpy },
      });
      await svc.hardClosePeriod(scope, 'p-1', 'Auditoria');
      expect((auditSpy.mock.calls as any[])[0][2]).toMatchObject({
        eventType: 'period.hard_closed',
        payload:    expect.objectContaining({ fromStatus: 'OPEN', toStatus: 'HARD_CLOSED' }),
      });
    });

    it('reopenPeriod emits period.reopened', async () => {
      const auditSpy = jest.fn(async () => {});
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('SOFT_CLOSED')) },
        auditService: { append: auditSpy },
      });
      await svc.reopenPeriod(scope, 'p-1', 'Correção');
      expect((auditSpy.mock.calls as any[])[0][2]).toMatchObject({
        eventType: 'period.reopened',
        payload:    expect.objectContaining({ fromStatus: 'SOFT_CLOSED', toStatus: 'OPEN' }),
      });
    });

    it('reopenPeriod with HARD_CLOSED throws before audit is emitted', async () => {
      const auditSpy = jest.fn(async () => {});
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('HARD_CLOSED')) },
        auditService: { append: auditSpy },
      });
      await expect(svc.reopenPeriod(scope, 'p-1')).rejects.toBeInstanceOf(ValidationError);
      expect(auditSpy).not.toHaveBeenCalled();
    });

    it('audit append failure inside tx rolls back the period transition', async () => {
      const { svc } = buildService({
        periodRepo: { findById: jest.fn(async () => makePeriod('FUTURE')) },
        auditService: { append: jest.fn(async () => { throw new Error('audit boom'); }) },
      });
      await expect(svc.openPeriod(scope, 'p-1')).rejects.toThrow('audit boom');
    });
  });
});
