/**
 * ReferentialMappingService — versioned Account→RFB mapping + coverage (BE-INCR-9 / ADR-INCR9).
 *
 * Unit-level gates (mocked repos) owned by this slice:
 *  - policy-first: canManageReferential / canReadReferential (ForbiddenError);
 *  - in-tx gate (ACC-011): account re-read INSIDE the tx — soft-deleted/absent → NotFound,
 *    grouping account (acceptsEntries=false) → ValidationError;
 *  - audit-in-tx (ACC-019): set/unset append the audit event with the tx handle;
 *  - coverage is CHART-driven, NEVER balance-driven (D3): an active leaf with no posting is
 *    reported unmapped; a grouping account is never reported; a mapped leaf drops out;
 *  - unset of a non-existent mapping → NotFound;
 *  - structural: the service has NO posting/journalEntry repo — it cannot write ledger money.
 *
 * The @@unique versioning coexistence, idempotent upsert, hard-delete-re-set and cascade are
 * SCHEMA guarantees proven in ReferentialMapping.integration.test.ts (a mock cannot prove them).
 */
import { ReferentialMappingService } from '../ReferentialMappingService';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

const TX = { __tx: true };

const leaf = (id: string, code: string, nature = 'Asset') => ({
  id,
  code,
  name: `Conta ${code}`,
  nature,
  acceptsEntries: true,
  deletedAt: null,
});
const grouping = (id: string, code: string) => ({ ...leaf(id, code), acceptsEntries: false });

function buildService(over: {
  repo?: Record<string, unknown>;
  accountRepo?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  audit?: Record<string, unknown>;
} = {}) {
  const repo = {
    upsert: jest.fn(async () => ({ id: 'map-1' })),
    deleteByAccountVersion: jest.fn(async () => 1),
    findByAccountAndVersion: jest.fn(async () => ({ id: 'map-1', referentialCode: '1.01.01' })),
    findManyByVersion: jest.fn(async () => []),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
    ...over.repo,
  };
  const accountRepo = {
    findById: jest.fn(async () => leaf('acc-leaf', '1.1.1')),
    findManyByUnit: jest.fn(async () => []),
    ...over.accountRepo,
  };
  const policy = {
    canManageReferential: jest.fn(() => true),
    canReadReferential: jest.fn(() => true),
    ...over.policy,
  };
  const audit = { append: jest.fn(async () => undefined), ...over.audit };
  const svc = new ReferentialMappingService(
    repo as never,
    accountRepo as never,
    policy as never,
    audit as never,
  );
  return { svc, repo, accountRepo, policy, audit };
}

const setDto = {
  unitId: 'unit-1',
  accountId: 'acc-leaf',
  referentialCode: '1.01.01.00',
  label: 'Caixa (referencial)',
  mappingVersion: '2025',
};

describe('ReferentialMappingService.setMapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('policy-first: denies without canManageReferential (ForbiddenError, no write)', async () => {
    const { svc, repo, audit } = buildService({ policy: { canManageReferential: () => false } });
    await expect(svc.setMapping(scope, setDto)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.runTransaction).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('gate in-tx: account re-read with the tx handle; soft-deleted/absent → NotFound (no upsert)', async () => {
    const { svc, repo, accountRepo, audit } = buildService({
      accountRepo: { findById: jest.fn(async () => null) },
    });
    await expect(svc.setMapping(scope, setDto)).rejects.toBeInstanceOf(NotFoundError);
    // ACC-011: findById called INSIDE the tx (3rd arg is the tx handle).
    expect(accountRepo.findById).toHaveBeenCalledWith(scope, 'acc-leaf', TX);
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('gate: a grouping account (acceptsEntries=false) → ValidationError (only leaves map)', async () => {
    const { svc, repo } = buildService({
      accountRepo: { findById: jest.fn(async () => grouping('acc-grp', '1.1')) },
    });
    await expect(svc.setMapping(scope, setDto)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('happy path: upsert + audit append run in the SAME tx (ACC-012/019)', async () => {
    const { svc, repo, audit } = buildService();
    await svc.setMapping(scope, setDto);
    expect(repo.upsert).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        accountId: 'acc-leaf',
        referentialCode: '1.01.01.00',
        mappingVersion: '2025',
        createdById: 'u1',
      }),
      TX,
    );
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({
        eventType: 'referential.mapping.set',
        targetType: 'ReferentialMapping',
        targetId: 'map-1',
      }),
    );
  });

  it('structural: the service injects no posting/journalEntry repo — cannot write ledger money', () => {
    // ReferentialMappingService(repo, accountRepo, policy, audit) — 4 deps, none is a
    // posting/journal-entry repo. The "zero ledger write" invariant is structural, not runtime.
    expect(ReferentialMappingService.length).toBe(4);
  });
});

describe('ReferentialMappingService.unsetMapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('hard-delete + audit in the same tx', async () => {
    const { svc, repo, audit } = buildService();
    await svc.unsetMapping(scope, { unitId: 'unit-1', accountId: 'acc-leaf', mappingVersion: '2025' });
    expect(repo.deleteByAccountVersion).toHaveBeenCalledWith(scope, 'acc-leaf', '2025', TX);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'referential.mapping.unset', targetType: 'ReferentialMapping' }),
    );
  });

  it('unset of a non-existent mapping → NotFound (no delete, no audit)', async () => {
    const { svc, repo, audit } = buildService({
      repo: { findByAccountAndVersion: jest.fn(async () => null) },
    });
    await expect(
      svc.unsetMapping(scope, { unitId: 'unit-1', accountId: 'acc-x', mappingVersion: '2025' }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.deleteByAccountVersion).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });
});

describe('ReferentialMappingService.coverage (CHART-driven, D3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('a zero-movement active leaf with no mapping IS reported unmapped; a grouping account is NOT', async () => {
    const accounts = [
      leaf('acc-cash', '1.1.1'), // leaf, unmapped → must appear
      grouping('acc-current-assets', '1.1'), // grouping → must NOT appear
      leaf('acc-rev', '3.1.1', 'Revenue'), // leaf, will be mapped → must NOT appear
    ];
    const { svc, repo, accountRepo } = buildService({
      accountRepo: { findManyByUnit: jest.fn(async () => accounts) },
      repo: { findManyByVersion: jest.fn(async () => [{ accountId: 'acc-rev' }]) },
    });

    const report = await svc.coverage(scope, '2025');

    // membership comes from the CHART (findManyByUnit), never from postings/groupByAccount.
    expect(accountRepo.findManyByUnit).toHaveBeenCalledWith(scope);
    expect(repo.findManyByVersion).toHaveBeenCalledWith(scope, '2025');

    const codes = report.unmappedAccounts.map((a) => a.code);
    expect(codes).toEqual(['1.1.1']); // only the unmapped leaf
    expect(report.totals).toEqual({ leafAccountCount: 2, mappedCount: 1, unmappedCount: 1 });
    expect(report.ready).toBe(false);
    expect(report.mappingVersion).toBe('2025');
  });

  it('ready=true when every active leaf is mapped in the version', async () => {
    const accounts = [leaf('acc-cash', '1.1.1'), leaf('acc-rev', '3.1.1', 'Revenue')];
    const { svc } = buildService({
      accountRepo: { findManyByUnit: jest.fn(async () => accounts) },
      repo: { findManyByVersion: jest.fn(async () => [{ accountId: 'acc-cash' }, { accountId: 'acc-rev' }]) },
    });
    const report = await svc.coverage(scope, '2025');
    expect(report.unmappedAccounts).toHaveLength(0);
    expect(report.ready).toBe(true);
  });

  it('coverage denies without canReadReferential', async () => {
    const { svc } = buildService({ policy: { canReadReferential: () => false } });
    await expect(svc.coverage(scope, '2025')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('a version with mappings for another version does not satisfy THIS version (version isolation)', async () => {
    const accounts = [leaf('acc-cash', '1.1.1')];
    // findManyByVersion('2026') returns the 2026 mapping; querying 2025 must still see it unmapped.
    const { svc } = buildService({
      accountRepo: { findManyByUnit: jest.fn(async () => accounts) },
      repo: { findManyByVersion: jest.fn(async (_s: unknown, v: string) => (v === '2026' ? [{ accountId: 'acc-cash' }] : [])) },
    });
    const report2025 = await svc.coverage(scope, '2025');
    expect(report2025.unmappedAccounts.map((a) => a.code)).toEqual(['1.1.1']);
    expect(report2025.ready).toBe(false);
  });
});
