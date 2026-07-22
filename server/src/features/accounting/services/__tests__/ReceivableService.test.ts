import { ReceivableService } from '../ReceivableService';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { CLIENTES_A_RECEBER_CODE } from '../../fixtures/ChartOfAccountsFixture';
import { AR_RECEIVABLE_SOURCE_TYPE, AR_RECEIPT_SOURCE_TYPE } from '../../models/Receivable.model';
import type { Account, Receivable, ReceivableReceipt } from 'generated/prisma';
import type { PostEntryInput } from '../../dtos/PostingDto';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function revenueAcc(over: Partial<Account> = {}): Account {
  return {
    id: 'rev-1', userId: 'owner-1', unitId: 'unit-1', code: '3.1', name: 'Receita de Serviços',
    nature: 'Revenue', acceptsEntries: true, createdAt: new Date(), updatedAt: new Date(),
    deletedAt: null, ...over,
  } as Account;
}

function receivableRow(over: Partial<Receivable> = {}): Receivable {
  return {
    id: 'rec-1', userId: 'owner-1', unitId: 'unit-1', customerName: 'Cliente XPTO', customerRef: null,
    documentNumber: 'FAT-100', description: 'Serviço faturado', issueDate: new Date('2026-06-10'),
    dueDate: new Date('2026-07-10'), amountCents: 50000, revenueAccountId: 'rev-1',
    status: 'OPEN', createdById: 'owner-1', cancelledById: null, cancelReason: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as Receivable;
}

function receiptRow(over: Partial<ReceivableReceipt> = {}): ReceivableReceipt {
  return {
    id: 'recp-1', userId: 'owner-1', unitId: 'unit-1', receivableId: 'rec-1', amountCents: 50000,
    method: 'Pix', receivedAt: new Date('2026-07-05'), receivedByUserId: 'owner-1', status: 'ACTIVE',
    entryId: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  } as ReceivableReceipt;
}

interface Opts {
  canManage?: boolean;
  canRead?: boolean;
  claimResults?: number[]; // successive claimForReceipt return values
  markResults?: number[]; // successive markReceivedIfReceiving (RECEIVING→RECEIVED CAS) return values
  findEntryBySource?: (type: string, id: string) => unknown;
  revenueAccount?: Account | null;
  counterparty?: { id: string; userId: string; unitId: string; type: string } | null;
}

function build(opts: Opts = {}) {
  let entrySeq = 0;
  const postEntry = jest.fn(async (_s: unknown, input: PostEntryInput) => ({ id: `entry-${++entrySeq}`, ...input }));
  const reverseEntry = jest.fn(async (_s: unknown, input: { lancamentoId: string }) => ({
    reversal: { id: `rev-${input.lancamentoId}` },
    original: { id: input.lancamentoId },
  }));
  const findEntryBySource = jest.fn(async (_s: unknown, type: string, id: string) =>
    (opts.findEntryBySource ? opts.findEntryBySource(type, id) : null),
  );

  const claimResults = [...(opts.claimResults ?? [1])];
  const claimForReceipt = jest.fn(async () => (claimResults.length ? claimResults.shift()! : 1));
  const markResults = [...(opts.markResults ?? [])];
  const markReceivedIfReceiving = jest.fn(async () => (markResults.length ? markResults.shift()! : 1));

  const createdReceipts: ReceivableReceipt[] = [];
  const receivableRepo = {
    create: jest.fn(async (data: Record<string, unknown>) => receivableRow({ id: 'rec-new', ...data } as Partial<Receivable>)),
    findById: jest.fn(async () => receivableRow()),
    findByIdWithReceipts: jest.fn(async () => ({ ...receivableRow(), receipts: [] })),
    findManyByUnit: jest.fn(async () => ({ receivables: [], total: 0 })),
    findAllActive: jest.fn(async () => [] as Receivable[]),
    claimForReceipt,
    markReceivedIfReceiving,
    updateReceivable: jest.fn(async (_s, id: string, data: Record<string, unknown>) => receivableRow({ id, ...data } as Partial<Receivable>)),
    createReceipt: jest.fn(async (data: Record<string, unknown>) => {
      const r = receiptRow({ id: `recp-${createdReceipts.length + 1}`, ...data } as Partial<ReceivableReceipt>);
      createdReceipts.push(r);
      return r;
    }),
    findReceiptById: jest.fn(async () => receiptRow()),
    findActiveReceipt: jest.fn(async () => null),
    findAllActiveReceipts: jest.fn(async () => [] as ReceivableReceipt[]),
    updateReceipt: jest.fn(async (_s, id: string, data: Record<string, unknown>) => receiptRow({ id, ...data } as Partial<ReceivableReceipt>)),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const accountRepo = {
    findById: jest.fn(async () => (opts.revenueAccount === undefined ? revenueAcc() : opts.revenueAccount)),
  };
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = {
    canManageReceivable: () => opts.canManage ?? true,
    canReadReceivable: () => opts.canRead ?? true,
  };
  // Default: a CUSTOMER counterparty in THIS scope. `null` simulates a cross-scope/absent id.
  const defaultCp = { id: 'cp-cus', userId: 'owner-1', unitId: 'unit-1', type: 'CUSTOMER' };
  const counterpartyRepo = {
    findById: jest.fn(async () => (opts.counterparty === undefined ? defaultCp : opts.counterparty)),
  };

  const service = new ReceivableService(
    receivableRepo as never,
    accountRepo as never,
    { postEntry, reverseEntry, findEntryBySource } as never,
    auditService as never,
    policy as never,
    counterpartyRepo as never,
  );
  return { service, receivableRepo, accountRepo, auditService, postEntry, reverseEntry, findEntryBySource, counterpartyRepo };
}

const createDto = {
  unitId: 'unit-1', customerName: 'Cliente XPTO', documentNumber: 'FAT-100', description: 'Serviço faturado',
  issueDate: '2026-06-10', dueDate: '2026-07-10', amountCents: 50000, revenueAccountId: 'rev-1',
};
const receiveDto = { unitId: 'unit-1', method: 'Pix', receivedAt: '2026-07-05', amountCents: 50000 };

describe('ReceivableService.createReceivable — recognition (D2)', () => {
  it('books D 1.1.5 / C revenueAccount keyed sourceType=ar.receivable, sourceId=receivableId', async () => {
    const { service, postEntry } = build();
    await service.createReceivable(scope, createDto as never);

    expect(postEntry).toHaveBeenCalledTimes(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AR_RECEIVABLE_SOURCE_TYPE);
    expect(input.sourceId).toBe('rec-new'); // receivableId, never a fabricated key
    expect(input.date).toBe('2026-06-10'); // competência = issueDate
    // Recognition: debit the dedicated control account 1.1.5, credit revenue 3.1 (inverted from AP).
    expect(input.lines).toContainEqual({ accountCode: CLIENTES_A_RECEBER_CODE, debitCents: 50000, creditCents: 0 });
    expect(input.lines).toContainEqual({ accountCode: '3.1', debitCents: 0, creditCents: 50000 });
    // Provenance seam (D6/F4): the fatura flows into sourceDocument.
    expect(input.sourceDocument?.externalRef).toBe('FAT-100');
    expect(input.sourceDocument?.documentDate).toBe('2026-06-10');
  });

  it('rejects a non-Revenue contrapartida (gate D4)', async () => {
    const { service } = build({ revenueAccount: revenueAcc({ nature: 'Asset' }) });
    await expect(service.createReceivable(scope, createDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a synthetic (non-leaf) revenue account', async () => {
    const { service } = build({ revenueAccount: revenueAcc({ acceptsEntries: false }) });
    await expect(service.createReceivable(scope, createDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('compensates the row (soft-delete + rename) when the recognition posting fails', async () => {
    const { service, postEntry, receivableRepo } = build();
    postEntry.mockRejectedValueOnce(new Error('period closed'));
    await expect(service.createReceivable(scope, createDto as never)).rejects.toThrow('period closed');
    const comp = receivableRepo.updateReceivable.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(comp.status).toBe('CANCELLED');
    expect(comp.deletedAt).toBeInstanceOf(Date);
    expect(comp.documentNumber).toBe('deleted:rec-new:FAT-100');
  });

  it('forbids without canManageReceivable', async () => {
    const { service } = build({ canManage: false });
    await expect(service.createReceivable(scope, createDto as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('ReceivableService.createReceivable — counterparty link (INCR-COUNTERPARTY / SEC-A1-1)', () => {
  const dtoWithCp = { ...createDto, counterpartyId: 'cp-cus' };

  it('resolves counterpartyId RE-SCOPED and persists it on the row', async () => {
    const { service, receivableRepo, counterpartyRepo } = build();
    await service.createReceivable(scope, dtoWithCp as never);
    expect(counterpartyRepo.findById).toHaveBeenCalledWith(scope, 'cp-cus');
    const created = receivableRepo.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.counterpartyId).toBe('cp-cus');
    expect(created.customerName).toBe('Cliente XPTO'); // snapshot preserved alongside the FK
  });

  it('rejects a counterpartyId of ANOTHER scope (findById → null ⇒ ValidationError, IDOR #1)', async () => {
    const { service, receivableRepo } = build({ counterparty: null });
    await expect(service.createReceivable(scope, dtoWithCp as never)).rejects.toBeInstanceOf(ValidationError);
    expect(receivableRepo.create).not.toHaveBeenCalled();
  });

  it('rejects linking a receivable to a SUPPLIER counterparty', async () => {
    const { service } = build({ counterparty: { id: 'cp-sup', userId: 'owner-1', unitId: 'unit-1', type: 'SUPPLIER' } });
    await expect(service.createReceivable(scope, dtoWithCp as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('leaves counterpartyId null when none is supplied (nullable this increment, SEC-A1-5)', async () => {
    const { service, receivableRepo, counterpartyRepo } = build();
    await service.createReceivable(scope, createDto as never);
    expect(counterpartyRepo.findById).not.toHaveBeenCalled();
    const created = receivableRepo.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.counterpartyId).toBeNull();
  });
});

describe('ReceivableService.registerReceipt — receipt (D2/D3/D4)', () => {
  it('books D method-account / C 1.1.5 keyed sourceType=ar.receipt, sourceId=receiptId (NOT receivableId)', async () => {
    const { service, postEntry } = build();
    await service.registerReceipt(scope, 'rec-1', receiveDto as never);

    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AR_RECEIPT_SOURCE_TYPE);
    expect(input.sourceId).toBe('recp-1'); // receiptId — the whole point of D3
    expect(input.sourceId).not.toBe('rec-1');
    expect(input.date).toBe('2026-07-05'); // data efetiva do crédito
    // Receipt: debit Banco (Pix), credit the control account 1.1.5 (inverted from AP).
    expect(input.lines).toContainEqual({ accountCode: '1.1.1', debitCents: 50000, creditCents: 0 }); // Pix → Banco
    expect(input.lines).toContainEqual({ accountCode: CLIENTES_A_RECEBER_CODE, debitCents: 0, creditCents: 50000 });
  });

  it('Cash debits Caixa 1.1.3; unknown method REJECTS (closed map, D2)', async () => {
    const cash = build();
    await cash.service.registerReceipt(scope, 'rec-1', { ...receiveDto, method: 'Cash' } as never);
    const input = (cash.postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.lines).toContainEqual({ accountCode: '1.1.3', debitCents: 50000, creditCents: 0 });

    const bad = build();
    await expect(
      bad.service.registerReceipt(scope, 'rec-1', { ...receiveDto, method: 'Crypto' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bad.postEntry).not.toHaveBeenCalled(); // rejected before any ledger write
  });

  it('TOCTOU: two parallel receipts → exactly one succeeds (claimForReceipt CAS)', async () => {
    const { service, postEntry, receivableRepo } = build({ claimResults: [1, 0] });
    const results = await Promise.allSettled([
      service.registerReceipt(scope, 'rec-1', receiveDto as never),
      service.registerReceipt(scope, 'rec-1', receiveDto as never),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);
    expect(postEntry).toHaveBeenCalledTimes(1);
    expect(receivableRepo.createReceipt).toHaveBeenCalledTimes(1);
  });

  it('rejects a partial amount (full-receipt MVP guard, F2)', async () => {
    const { service } = build();
    await expect(
      service.registerReceipt(scope, 'rec-1', { ...receiveDto, amountCents: 30000 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects receiving a non-OPEN receivable', async () => {
    const { service, receivableRepo } = build();
    receivableRepo.findByIdWithReceipts.mockResolvedValueOnce({ ...receivableRow({ status: 'RECEIVED' }), receipts: [] });
    await expect(service.registerReceipt(scope, 'rec-1', receiveDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('does NOT revert the claim after a successful post (never revert over a booked ledger)', async () => {
    const { service, receivableRepo } = build();
    receivableRepo.runTransaction.mockRejectedValueOnce(new Error('finalize crash'));
    await expect(service.registerReceipt(scope, 'rec-1', receiveDto as never)).rejects.toThrow('finalize crash');
    const reverts = receivableRepo.updateReceivable.mock.calls.filter((c) => (c[2] as { status?: string }).status === 'OPEN');
    expect(reverts).toHaveLength(0);
  });

  it('emits receivable.receipt_registered exactly once on the happy path (CAS won)', async () => {
    const { service, auditService } = build(); // markReceivedIfReceiving defaults to 1 (won)
    await service.registerReceipt(scope, 'rec-1', receiveDto as never);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.filter((c) => c[2].eventType === 'receivable.receipt_registered')).toHaveLength(1);
  });

  it('does NOT emit when a concurrent reconcile already finalized the receipt (CAS lost)', async () => {
    const { service, auditService } = build({ markResults: [0] }); // RECEIVING→RECEIVED CAS matched 0 rows
    await service.registerReceipt(scope, 'rec-1', receiveDto as never);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.filter((c) => c[2].eventType === 'receivable.receipt_registered')).toHaveLength(0);
  });
});

describe('ReceivableService.cancelReceivable — reverse recognition (F6/ACC-018/D3)', () => {
  it('reverses the recognition and renames the business key (rename-on-delete)', async () => {
    const { service, reverseEntry, receivableRepo } = build({
      findEntryBySource: (type) => (type === AR_RECEIVABLE_SOURCE_TYPE ? { id: 'rec-entry-1' } : null),
    });
    await service.cancelReceivable(scope, 'rec-1', { unitId: 'unit-1', reversalDate: '2026-07-14', reason: 'erro' } as never);

    expect(reverseEntry).toHaveBeenCalledTimes(1);
    expect((reverseEntry.mock.calls[0] as unknown[])[1]).toMatchObject({ lancamentoId: 'rec-entry-1', reversalPostingDate: '2026-07-14' });
    const upd = receivableRepo.updateReceivable.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(upd.status).toBe('CANCELLED');
    expect(upd.documentNumber).toBe('deleted:rec-1:FAT-100'); // frees the @@unique for a re-create
  });

  it('is idempotent when already cancelled', async () => {
    const { service, reverseEntry, receivableRepo } = build();
    receivableRepo.findByIdWithReceipts.mockResolvedValueOnce({ ...receivableRow({ status: 'CANCELLED' }), receipts: [] });
    await service.cancelReceivable(scope, 'rec-1', { unitId: 'unit-1', reversalDate: '2026-07-14' } as never);
    expect(reverseEntry).not.toHaveBeenCalled();
  });

  it('refuses to cancel a RECEIVED receivable (must undo the receipt first)', async () => {
    const { service, receivableRepo } = build();
    receivableRepo.findByIdWithReceipts.mockResolvedValueOnce({ ...receivableRow({ status: 'RECEIVED' }), receipts: [] });
    await expect(
      service.cancelReceivable(scope, 'rec-1', { unitId: 'unit-1', reversalDate: '2026-07-14' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('ReceivableService.cancelReceipt — reverse receipt + reopen (net-zero on 1.1.5)', () => {
  it('reverses the receipt, cancels it, reopens the receivable', async () => {
    const { service, reverseEntry, receivableRepo } = build({
      findEntryBySource: (type) => (type === AR_RECEIPT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    await service.cancelReceipt(scope, 'rec-1', 'recp-1', { unitId: 'unit-1', reversalDate: '2026-07-14' } as never);

    expect((reverseEntry.mock.calls[0] as unknown[])[1]).toMatchObject({ lancamentoId: 'set-1' });
    const receiptUpd = receivableRepo.updateReceipt.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(receiptUpd.status).toBe('CANCELLED');
    const receivableUpd = receivableRepo.updateReceivable.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(receivableUpd.status).toBe('OPEN'); // reopened
  });
});

describe('ReceivableService.reconcileReceivables — re-drive safety net (D4/ADR §6.2)', () => {
  it('re-posts a missing recognition for a live receivable', async () => {
    const { service, receivableRepo, postEntry } = build();
    receivableRepo.findAllActive.mockResolvedValueOnce([receivableRow({ id: 'rec-1', status: 'OPEN' })]);
    const out = await service.reconcileReceivables(scope);
    expect(out.recognitionsPosted).toBe(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AR_RECEIVABLE_SOURCE_TYPE);
    expect(input.sourceId).toBe('rec-1');
  });

  it('re-posts a missing receipt AND finalizes a RECEIVING receivable', async () => {
    const { service, receivableRepo, postEntry } = build();
    receivableRepo.findAllActiveReceipts.mockResolvedValueOnce([receiptRow({ id: 'recp-1', receivableId: 'rec-1' })]);
    receivableRepo.findById.mockResolvedValue(receivableRow({ id: 'rec-1', status: 'RECEIVING' }));
    const out = await service.reconcileReceivables(scope);
    expect(out.receiptsPosted).toBe(1);
    expect(out.finalized).toBe(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AR_RECEIPT_SOURCE_TYPE);
    expect(input.sourceId).toBe('recp-1');
    expect(receivableRepo.markReceivedIfReceiving).toHaveBeenCalledWith(expect.anything(), 'rec-1', expect.anything());
  });

  it('does NOT emit (nor count) when the finalize CAS loses to a concurrent finalizer', async () => {
    const { service, receivableRepo, auditService } = build({
      markResults: [0],
      findEntryBySource: (type) => (type === AR_RECEIPT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    receivableRepo.findAllActiveReceipts.mockResolvedValueOnce([receiptRow({ id: 'recp-1', receivableId: 'rec-1', entryId: null })]);
    receivableRepo.findById.mockResolvedValue(receivableRow({ id: 'rec-1', status: 'RECEIVING' }));
    const out = await service.reconcileReceivables(scope);

    expect(out.finalized).toBe(0);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.find((c) => c[2].eventType === 'receivable.receipt_registered')).toBeFalsy();
  });

  it('re-emits receivable.receipt_registered when finalizing a crash-stranded RECEIVING receivable', async () => {
    const { service, receivableRepo, auditService, postEntry } = build({
      findEntryBySource: (type) => (type === AR_RECEIPT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    receivableRepo.findAllActiveReceipts.mockResolvedValueOnce([receiptRow({ id: 'recp-1', receivableId: 'rec-1', entryId: null })]);
    receivableRepo.findById.mockResolvedValue(receivableRow({ id: 'rec-1', status: 'RECEIVING' }));
    const out = await service.reconcileReceivables(scope);

    expect(postEntry).not.toHaveBeenCalled(); // receipt existed
    expect(out.finalized).toBe(1);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string; payload: Record<string, unknown> }]>;
    const evt = calls.find((c) => c[2].eventType === 'receivable.receipt_registered');
    expect(evt).toBeTruthy();
    expect(evt![2].payload).toMatchObject({ receivableId: 'rec-1', receiptId: 'recp-1', entryId: 'set-1' });
  });

  it('does NOT re-emit the domain audit for an already-finalized (RECEIVED + linked) receipt', async () => {
    const { service, receivableRepo, auditService } = build({
      findEntryBySource: (type) => (type === AR_RECEIPT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    receivableRepo.findAllActiveReceipts.mockResolvedValueOnce([receiptRow({ id: 'recp-1', receivableId: 'rec-1', entryId: 'set-1' })]);
    receivableRepo.findById.mockResolvedValue(receivableRow({ id: 'rec-1', status: 'RECEIVED' }));
    const out = await service.reconcileReceivables(scope);

    expect(out.finalized).toBe(0);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.find((c) => c[2].eventType === 'receivable.receipt_registered')).toBeFalsy();
  });

  it('does NOT re-post when the recognition already exists (idempotent)', async () => {
    const { service, receivableRepo, postEntry } = build({
      findEntryBySource: (type) => (type === AR_RECEIVABLE_SOURCE_TYPE ? { id: 'rec-entry-1' } : null),
    });
    receivableRepo.findAllActive.mockResolvedValueOnce([receivableRow({ id: 'rec-1', status: 'OPEN' })]);
    const out = await service.reconcileReceivables(scope);
    expect(out.recognitionsPosted).toBe(0);
    expect(postEntry).not.toHaveBeenCalled();
  });

  it('skips cancelled receivables', async () => {
    const { service, receivableRepo, postEntry } = build();
    receivableRepo.findAllActive.mockResolvedValueOnce([receivableRow({ id: 'rec-x', status: 'CANCELLED' })]);
    const out = await service.reconcileReceivables(scope);
    expect(out.recognitionsPosted).toBe(0);
    expect(postEntry).not.toHaveBeenCalled();
  });
});
