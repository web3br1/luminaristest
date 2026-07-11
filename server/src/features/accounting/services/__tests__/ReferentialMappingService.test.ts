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

describe('ReferentialMappingService.batchSet (atomic all-or-nothing, D8)', () => {
  beforeEach(() => jest.clearAllMocks());

  const batchDto = {
    unitId: 'unit-1',
    mappingVersion: '2025',
    items: [
      { accountId: 'acc-a', referentialCode: '1.01', label: 'A' },
      { accountId: 'acc-b', referentialCode: '1.02', label: 'B' },
    ],
  };

  it('policy-first: denies without canManageReferential (no tx, no write)', async () => {
    const { svc, repo, audit } = buildService({ policy: { canManageReferential: () => false } });
    await expect(svc.batchSet(scope, batchDto)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.runTransaction).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('happy path: every item upserts + audits inside ONE shared tx (tx propagated to every write)', async () => {
    const { svc, repo, accountRepo, audit } = buildService();
    const out = await svc.batchSet(scope, batchDto);
    expect(out).toHaveLength(2);
    expect(repo.runTransaction).toHaveBeenCalledTimes(1);
    // each item re-checked in-tx (ACC-011) and upserted with the SAME tx handle.
    expect(accountRepo.findById).toHaveBeenNthCalledWith(1, scope, 'acc-a', TX);
    expect(accountRepo.findById).toHaveBeenNthCalledWith(2, scope, 'acc-b', TX);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
    expect(repo.upsert).toHaveBeenNthCalledWith(
      1,
      scope,
      expect.objectContaining({ accountId: 'acc-a', referentialCode: '1.01', mappingVersion: '2025', createdById: 'u1' }),
      TX,
    );
    expect(audit.append).toHaveBeenCalledTimes(2);
    expect(audit.append).toHaveBeenCalledWith(
      TX,
      scope,
      expect.objectContaining({ eventType: 'referential.mapping.set', targetType: 'ReferentialMapping' }),
    );
  });

  it('one bad item (grouping account) rolls the WHOLE batch back (ValidationError propagates out of the tx)', async () => {
    // acc-a is a leaf, acc-b is a grouping account → the 2nd item must abort the tx.
    const findById = jest.fn(async (_s: unknown, id: string, _tx: unknown) =>
      id === 'acc-b' ? grouping('acc-b', '1.02') : leaf(id, '1.01'),
    );
    const { svc, repo } = buildService({ accountRepo: { findById } });
    await expect(svc.batchSet(scope, batchDto)).rejects.toBeInstanceOf(ValidationError);
    // runTransaction rejects → Prisma rolls back; the good item's upsert never commits.
    // Only the first (good) item reached upsert before the second threw.
    expect(repo.upsert).toHaveBeenCalledTimes(1);
  });

  it('one absent/soft-deleted item aborts the batch (NotFound propagates)', async () => {
    const findById = jest.fn(async (_s: unknown, id: string, _tx: unknown) =>
      id === 'acc-b' ? null : leaf(id, '1.01'),
    );
    const { svc } = buildService({ accountRepo: { findById } });
    await expect(svc.batchSet(scope, batchDto)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('ReferentialMappingService.copyVersion (year inheritance, D6/D9)', () => {
  beforeEach(() => jest.clearAllMocks());

  const copyDto = { unitId: 'unit-1', fromVersion: '2025', toVersion: '2026' };

  it('happy path: copies each source mapping into toVersion, re-snapshotting label literally', async () => {
    const source = [
      { id: 'm1', accountId: 'acc-a', referentialCode: '1.01', label: 'A-2025', mappingVersion: '2025' },
      { id: 'm2', accountId: 'acc-b', referentialCode: '1.02', label: 'B-2025', mappingVersion: '2025' },
    ];
    const { svc, repo, audit } = buildService({
      repo: { findManyByVersion: jest.fn(async () => source) },
    });
    const out = await svc.copyVersion(scope, copyDto);
    expect(out).toHaveLength(2);
    expect(repo.runTransaction).toHaveBeenCalledTimes(1);
    // source read inside the tx.
    expect(repo.findManyByVersion).toHaveBeenCalledWith(scope, '2025', TX);
    // each upsert targets toVersion with the label copied literally (D9).
    expect(repo.upsert).toHaveBeenNthCalledWith(
      1,
      scope,
      expect.objectContaining({ accountId: 'acc-a', referentialCode: '1.01', label: 'A-2025', mappingVersion: '2026' }),
      TX,
    );
    expect(repo.upsert).toHaveBeenNthCalledWith(
      2,
      scope,
      expect.objectContaining({ accountId: 'acc-b', label: 'B-2025', mappingVersion: '2026' }),
      TX,
    );
    expect(audit.append).toHaveBeenCalledTimes(2);
  });

  it('empty source version → NotFound (nothing to copy, no write)', async () => {
    const { svc, repo } = buildService({ repo: { findManyByVersion: jest.fn(async () => []) } });
    await expect(svc.copyVersion(scope, copyDto)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('idempotent re-copy: an existing target row is upserted in place (repo.upsert, never a create/P2002)', async () => {
    // The service always calls repo.upsert — the @@unique(mappingVersion) makes a
    // pre-existing (acc-a, 2026) row an update, not a duplicate-key crash.
    const source = [{ id: 'm1', accountId: 'acc-a', referentialCode: '1.01', label: 'A', mappingVersion: '2025' }];
    const { svc, repo } = buildService({ repo: { findManyByVersion: jest.fn(async () => source) } });
    await svc.copyVersion(scope, copyDto);
    await svc.copyVersion(scope, copyDto); // second run must not throw
    expect(repo.upsert).toHaveBeenCalledTimes(2);
  });

  it('policy-first: denies without canManageReferential', async () => {
    const { svc, repo } = buildService({ policy: { canManageReferential: () => false } });
    await expect(svc.copyVersion(scope, copyDto)).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.runTransaction).not.toHaveBeenCalled();
  });
});

describe('ReferentialMappingService.authoringSkeleton (chart-driven, D5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-exposes coverage().unmappedAccounts as an authoring template (no independent chart re-query)', async () => {
    const accounts = [
      leaf('acc-cash', '1.1.1'),
      grouping('acc-grp', '1.1'),
      leaf('acc-rev', '3.1.1', 'Revenue'),
    ];
    const { svc, accountRepo, repo } = buildService({
      accountRepo: { findManyByUnit: jest.fn(async () => accounts) },
      repo: { findManyByVersion: jest.fn(async () => [{ accountId: 'acc-rev' }]) },
    });
    const skeleton = await svc.authoringSkeleton(scope, '2025');
    // exactly one chart read (via coverage), no second findManyByUnit.
    expect(accountRepo.findManyByUnit).toHaveBeenCalledTimes(1);
    expect(repo.findManyByVersion).toHaveBeenCalledWith(scope, '2025');
    expect(skeleton.unitId).toBe('unit-1');
    expect(skeleton.mappingVersion).toBe('2025');
    expect(skeleton.items.map((i) => i.code)).toEqual(['1.1.1']);
  });

  it('denies without canReadReferential (inherits coverage read gate)', async () => {
    const { svc } = buildService({ policy: { canReadReferential: () => false } });
    await expect(svc.authoringSkeleton(scope, '2025')).rejects.toBeInstanceOf(ForbiddenError);
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
