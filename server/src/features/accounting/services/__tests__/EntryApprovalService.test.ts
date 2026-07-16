import { EntryApprovalService } from '../EntryApprovalService';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { AccountingPolicy } from '../../policies/AccountingPolicy';
import type { AccountingScope } from '../../scope/AccountingScope';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { computeEntryContentHash } from '../../models/entryContentHash';
import type { Account, JournalEntry, Posting } from 'generated/prisma';

const maker = resolveAccountingScope({ userId: 'maker-1' }, 'unit-1');
const checker = resolveAccountingScope({ userId: 'checker-1' }, 'unit-1');

function acc(over: Partial<Account> = {}): Account {
  return {
    id: 'acc-1', userId: 'maker-1', unitId: 'unit-1', code: '1.1.1', name: 'Caixa',
    nature: 'Asset', acceptsEntries: true, createdAt: new Date(), updatedAt: new Date(),
    deletedAt: null, ...over,
  } as Account;
}

function entryRow(over: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: 'entry-1', userId: 'maker-1', unitId: 'unit-1', date: new Date('2026-06-10'),
    description: 'Lançamento manual', status: 'Draft', sourceType: 'manual', sourceId: null,
    reversedById: null, createdById: 'maker-1', submittedById: null, approvedById: null,
    postedById: null, version: 1, contentHash: null, fiscalYear: null, entryNumber: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  } as JournalEntry;
}

function leg(over: Partial<Posting> = {}): Posting {
  return {
    id: 'p-1', userId: 'maker-1', unitId: 'unit-1', entryId: 'entry-1', accountId: 'acc-1',
    debitCents: 10000, creditCents: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
  } as Posting;
}

const twoLegs: Posting[] = [leg({ id: 'p-1', accountId: 'acc-1', debitCents: 10000, creditCents: 0 }),
  leg({ id: 'p-2', accountId: 'acc-2', debitCents: 0, creditCents: 10000 })];

interface Opts {
  entry?: Partial<JournalEntry>;
  postings?: Posting[];
  casResults?: number[]; // successive casUpdate return values
  periodOpen?: boolean;
  canManage?: boolean;
  canApprove?: boolean;
  sod?: boolean; // whether SoD is ENFORCED (membership present); default off = single-user staging
  approvePermitted?: boolean; // RBAC: whether the actor holds accounting.entry.approve (default: allowed)
}

function build(opts: Opts = {}) {
  const currentEntry = entryRow(opts.entry);
  const postings = opts.postings ?? twoLegs;
  const casResults = [...(opts.casResults ?? [1])];

  const casUpdate = jest.fn(async () => (casResults.length ? casResults.shift()! : 1));
  const journalEntryRepo = {
    create: jest.fn(async (data: Record<string, unknown>) => entryRow({ id: 'entry-new', ...data } as Partial<JournalEntry>)),
    findById: jest.fn(async () => ({ ...currentEntry, postings })),
    casUpdate,
    findManyByStatus: jest.fn(async () => ({ entries: [], total: 0 })),
  };
  const nextEntryNumber = jest.fn(async () => 7);
  const postingRepo = {
    create: jest.fn(async () => leg()),
    deleteByEntryId: jest.fn(async () => undefined),
    findByEntryId: jest.fn(async () => postings),
    nextEntryNumber,
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const accountRepo = {
    findByCode: jest.fn(async (_s: unknown, code: string) => acc({ id: `id-${code}`, code })),
  };
  const periodRepo = {
    findByYearMonth: jest.fn(async () => (opts.periodOpen === false ? { status: 'SOFT_CLOSED' } : { status: 'OPEN' })),
  };
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = {
    canManageEntryApproval: () => opts.canManage ?? true,
    canApproveEntry: () => opts.canApprove ?? true,
    enforcesSegregationOfDuties: () => opts.sod ?? false,
  };
  // RBAC enforcer (LGPD Fatia A): default no-op (owner/allowed); throws when the delegate lacks the perm.
  const accessControl = {
    assertPermission: jest.fn(async () => {
      if (opts.approvePermitted === false) throw new ForbiddenError('Esta ação requer a permissão \'accounting.entry.approve\'.');
    }),
  };

  const service = new EntryApprovalService(
    journalEntryRepo as never,
    postingRepo as never,
    accountRepo as never,
    periodRepo as never,
    auditService as never,
    policy as never,
    accessControl as never,
  );
  return { service, journalEntryRepo, postingRepo, accountRepo, periodRepo, auditService, accessControl, casUpdate, nextEntryNumber };
}

const draftDto = {
  unitId: 'unit-1', date: '2026-06-10', description: 'Lançamento manual',
  lines: [
    { accountCode: '1.1.1', debitCents: 10000, creditCents: 0 },
    { accountCode: '2.1.1', debitCents: 0, creditCents: 10000 },
  ],
};

describe('EntryApprovalService.createDraft', () => {
  it('creates a Draft with NO number (ACC-015) and createdById = actor', async () => {
    const { service, journalEntryRepo, auditService } = build();
    await service.createDraft(maker, draftDto as never);

    const data = (journalEntryRepo.create.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(data.status).toBe('Draft');
    expect(data.fiscalYear).toBeNull();
    expect(data.entryNumber).toBeNull();
    expect(data.createdById).toBe('maker-1');
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: 'entry.drafted' });
  });

  it('rejects an unbalanced draft (Σdébito ≠ Σcrédito)', async () => {
    const { service } = build();
    const bad = { ...draftDto, lines: [
      { accountCode: '1.1.1', debitCents: 10000, creditCents: 0 },
      { accountCode: '2.1.1', debitCents: 0, creditCents: 9999 },
    ] };
    await expect(service.createDraft(maker, bad as never)).rejects.toThrow(ValidationError);
  });

  it('is forbidden without canManageEntryApproval', async () => {
    const { service } = build({ canManage: false });
    await expect(service.createDraft(maker, draftDto as never)).rejects.toThrow(ForbiddenError);
  });
});

describe('EntryApprovalService.submitForApproval', () => {
  it('freezes the economic contentHash and moves Draft→PendingApproval via version CAS', async () => {
    const { service, casUpdate, auditService } = build({ entry: { status: 'Draft', version: 1 } });
    await service.submitForApproval(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 1 } as never);

    const casData = (casUpdate.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(casData.status).toBe('PendingApproval');
    expect(casData.submittedById).toBe('maker-1');
    expect(casData.version).toBe(2);
    // The stored hash must equal a hash computed over the SAME legs+date+description (ACC-022).
    expect(casData.contentHash).toBe(
      computeEntryContentHash({ date: new Date('2026-06-10'), description: 'Lançamento manual', postings: twoLegs }),
    );
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: 'entry.submitted' });
  });

  it('409s when the version CAS loses (concurrent modification)', async () => {
    const { service } = build({ entry: { status: 'Draft', version: 1 }, casResults: [0] });
    await expect(
      service.submitForApproval(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 1 } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects submitting a non-Draft entry', async () => {
    const { service } = build({ entry: { status: 'PendingApproval' } });
    await expect(
      service.submitForApproval(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toThrow(ValidationError);
  });
});

describe('EntryApprovalService.approveEntry — the money moment', () => {
  const pending = {
    status: 'PendingApproval', version: 2, createdById: 'maker-1', submittedById: 'maker-1',
    contentHash: computeEntryContentHash({ date: new Date('2026-06-10'), description: 'Lançamento manual', postings: twoLegs }),
  };

  it('SoD ENFORCED: the creator cannot approve their own entry (server-side, not just UI)', async () => {
    const { service } = build({ entry: pending, sod: true });
    await expect(
      service.approveEntry(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toThrow(ForbiddenError);
  });

  it('SoD ENFORCED: the submitter (even if not the creator) cannot approve', async () => {
    // createdById != submittedById; the submitter (checker-1) must still be blocked.
    const { service } = build({ entry: { ...pending, createdById: 'maker-1', submittedById: 'checker-1' }, sod: true });
    await expect(
      service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toThrow(ForbiddenError);
  });

  it('RBAC (LGPD Fatia A): a delegate WITHOUT accounting.entry.approve is blocked before any state read', async () => {
    // approvePermitted=false simulates a delegate (ownerUserId !== actorUserId) whose active roles do
    // not grant the permission. The approval must fail with ForbiddenError and never touch the entry.
    const { service, journalEntryRepo } = build({ entry: pending, approvePermitted: false });
    await expect(
      service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toThrow(ForbiddenError);
    expect(journalEntryRepo.casUpdate).not.toHaveBeenCalled();
  });

  it('RBAC: assertPermission is consulted for accounting.entry.approve on every approve', async () => {
    const { service, accessControl } = build({ entry: pending });
    await service.approveEntry(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never);
    expect(accessControl.assertPermission).toHaveBeenCalledWith(expect.anything(), 'accounting.entry.approve');
  });

  it('SoD OFF (single-user staging): the creator CAN approve their own entry and it posts (F3 re-ratified)', async () => {
    // sod default off — the lone operator submits and approves; the staging flow is usable.
    const { service, casUpdate, nextEntryNumber } = build({ entry: pending });
    await service.approveEntry(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never);

    expect(nextEntryNumber).toHaveBeenCalled();
    const casData = (casUpdate.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(casData.status).toBe('Posted');
    expect(casData.approvedById).toBe('maker-1'); // self-approval allowed when SoD off
  });

  it('SoD ENFORCED, different actor: assigns number (ACC-015), sets approvedById+postedById, audits with createdById', async () => {
    const { service, casUpdate, nextEntryNumber, auditService } = build({ entry: pending, sod: true });
    await service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never);

    expect(nextEntryNumber).toHaveBeenCalled();
    const casData = (casUpdate.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(casData.status).toBe('Posted');
    expect(casData.approvedById).toBe('checker-1');
    expect(casData.postedById).toBe('checker-1');
    expect(casData.entryNumber).toBe(7);
    expect(casData.fiscalYear).toBe(2026);
    expect(casData.version).toBe(3);
    const auditEvent = (auditService.append.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(auditEvent).toMatchObject({ eventType: 'entry.approved' });
    expect((auditEvent.payload as Record<string, unknown>).createdById).toBe('maker-1'); // SoD pair auditable
  });

  it('tamper: a contentHash that no longer matches the legs is rejected (risk #1)', async () => {
    const { service } = build({ entry: { ...pending, contentHash: 'stale-hash-does-not-match' } });
    await expect(
      service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toThrow(ValidationError);
  });

  it('refuses to post into a non-open period (authoritative gate)', async () => {
    const { service } = build({ entry: pending, periodOpen: false });
    await expect(
      service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toBeInstanceOf(Error);
  });

  it('409s when the version CAS loses to a concurrent approve/reject', async () => {
    const { service } = build({ entry: pending, casResults: [0] });
    await expect(
      service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2 } as never),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects approving a non-PendingApproval entry', async () => {
    const { service } = build({ entry: { status: 'Draft' } });
    await expect(
      service.approveEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 1 } as never),
    ).rejects.toThrow(ValidationError);
  });
});

describe('EntryApprovalService.rejectEntry', () => {
  it('sends a submitted entry back to Draft and clears submittedById/contentHash', async () => {
    const { service, casUpdate, auditService } = build({ entry: { status: 'PendingApproval', version: 2 } });
    await service.rejectEntry(checker, 'entry-1', { unitId: 'unit-1', expectedVersion: 2, reason: 'conta errada' } as never);

    const casData = (casUpdate.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(casData.status).toBe('Draft');
    expect(casData.submittedById).toBeNull();
    expect(casData.contentHash).toBeNull();
    expect(casData.version).toBe(3);
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: 'entry.rejected' });
  });
});

describe('EntryApprovalService.updateDraft', () => {
  it('replaces the legs of a Draft and clears the stale contentHash', async () => {
    const { service, postingRepo, casUpdate } = build({ entry: { status: 'Draft', version: 3 } });
    await service.updateDraft(maker, 'entry-1', { ...draftDto, expectedVersion: 3 } as never);

    expect(postingRepo.deleteByEntryId).toHaveBeenCalled();
    const casData = (casUpdate.mock.calls[0] as unknown[])[3] as Record<string, unknown>;
    expect(casData.contentHash).toBeNull();
    expect(casData.version).toBe(4);
  });

  it('refuses to edit a non-Draft entry', async () => {
    const { service } = build({ entry: { status: 'PendingApproval' } });
    await expect(
      service.updateDraft(maker, 'entry-1', { ...draftDto, expectedVersion: 2 } as never),
    ).rejects.toThrow(ValidationError);
  });
});

describe('EntryApprovalService.listPendingApproval', () => {
  it('requires canApproveEntry (the checker queue)', async () => {
    const { service } = build({ canApprove: false });
    await expect(
      service.listPendingApproval(checker, { unitId: 'unit-1', page: 1, limit: 50 } as never),
    ).rejects.toThrow(ForbiddenError);
  });

  it('reads only PendingApproval entries', async () => {
    const { service, journalEntryRepo } = build();
    await service.listPendingApproval(checker, { unitId: 'unit-1', page: 1, limit: 50 } as never);
    expect(journalEntryRepo.findManyByStatus).toHaveBeenCalledWith(checker, ['PendingApproval'], 0, 50);
  });
});

describe('EntryApprovalService — not found', () => {
  it('throws NotFoundError for a missing entry on submit', async () => {
    const { service, journalEntryRepo } = build();
    journalEntryRepo.findById = jest.fn(async () => null) as never;
    await expect(
      service.submitForApproval(maker, 'nope', { unitId: 'unit-1', expectedVersion: 1 } as never),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('AccountingPolicy.enforcesSegregationOfDuties — the gate that flips (F3 re-ratified)', () => {
  const policy = new AccountingPolicy();

  it('is OFF while ownerUserId === actorUserId (single-user reality today)', () => {
    // resolveAccountingScope collapses owner === actor, so SoD is a no-op — staging usable.
    expect(policy.enforcesSegregationOfDuties(resolveAccountingScope({ userId: 'u-1' }, 'unit-1'))).toBe(false);
  });

  it('is ON when a delegate acts on the owner books (ownerUserId !== actorUserId, future membership)', () => {
    const delegated: AccountingScope = {
      ownerUserId: 'owner-1', actorUserId: 'delegate-2', unitId: 'unit-1',
      ledgerCode: 'DEFAULT', baseCurrencyCode: 'BRL', timeZone: 'America/Sao_Paulo',
    };
    expect(policy.enforcesSegregationOfDuties(delegated)).toBe(true);
  });
});

// AppError import kept meaningful: the 409 conflict is an AppError with statusCode 409.
describe('EntryApprovalService — conflict type', () => {
  it('the version conflict is an AppError(409)', async () => {
    const { service } = build({ entry: { status: 'Draft', version: 1 }, casResults: [0] });
    await service
      .submitForApproval(maker, 'entry-1', { unitId: 'unit-1', expectedVersion: 1 } as never)
      .catch((e) => {
        expect(e).toBeInstanceOf(AppError);
        expect((e as AppError).statusCode).toBe(409);
      });
  });
});
