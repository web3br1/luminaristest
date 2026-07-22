import { PayableService } from '../PayableService';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { ESTOQUES_CODE, FORNECEDORES_A_PAGAR_CODE } from '../../fixtures/ChartOfAccountsFixture';
import { INVENTORY_INBOUND_SOURCE_TYPE } from '../../models/Inventory.model';
import { AP_PAYABLE_SOURCE_TYPE, AP_PAYMENT_SOURCE_TYPE } from '../../models/Payable.model';
import { CreatePayableSchema } from '../../dtos/PayableDto';
import type { Account, Payable, PayablePayment } from 'generated/prisma';
import type { PostEntryInput } from '../../dtos/PostingDto';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function expenseAcc(over: Partial<Account> = {}): Account {
  return {
    id: 'exp-1', userId: 'owner-1', unitId: 'unit-1', code: '4.1', name: 'Despesas',
    nature: 'Expense', acceptsEntries: true, createdAt: new Date(), updatedAt: new Date(),
    deletedAt: null, ...over,
  } as Account;
}

function payableRow(over: Partial<Payable> = {}): Payable {
  return {
    id: 'pay-1', userId: 'owner-1', unitId: 'unit-1', supplierName: 'ACME', supplierRef: null,
    counterpartyId: null, documentNumber: 'NF-100', description: 'Serviço', issueDate: new Date('2026-06-10'),
    dueDate: new Date('2026-07-10'), amountCents: 50000, expenseAccountId: 'exp-1',
    inventoryProductRef: null, inventoryQty: null,
    status: 'OPEN', createdById: 'owner-1', cancelledById: null, cancelReason: null,
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as Payable;
}

function paymentRow(over: Partial<PayablePayment> = {}): PayablePayment {
  return {
    id: 'paym-1', userId: 'owner-1', unitId: 'unit-1', payableId: 'pay-1', amountCents: 50000,
    method: 'Pix', paidAt: new Date('2026-07-05'), paidByUserId: 'owner-1', status: 'ACTIVE',
    entryId: null, createdAt: new Date(), updatedAt: new Date(), ...over,
  } as PayablePayment;
}

interface Opts {
  canManage?: boolean;
  canRead?: boolean;
  claimResults?: number[]; // successive claimForPayment return values
  markResults?: number[]; // successive markPaidIfPaying (PAYING→PAID CAS) return values
  findEntryBySource?: (type: string, id: string) => unknown;
  expenseAccount?: Account | null;
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
  const claimForPayment = jest.fn(async () => (claimResults.length ? claimResults.shift()! : 1));
  const markResults = [...(opts.markResults ?? [])];
  const markPaidIfPaying = jest.fn(async () => (markResults.length ? markResults.shift()! : 1));

  const createdPayments: PayablePayment[] = [];
  const payableRepo = {
    create: jest.fn(async (data: Record<string, unknown>) => payableRow({ id: 'pay-new', ...data } as Partial<Payable>)),
    findById: jest.fn(async () => payableRow()),
    findByIdWithPayments: jest.fn(async () => ({ ...payableRow(), payments: [] })),
    findManyByUnit: jest.fn(async () => ({ payables: [], total: 0 })),
    findAllActive: jest.fn(async () => [] as Payable[]),
    claimForPayment,
    markPaidIfPaying,
    updatePayable: jest.fn(async (_s, id: string, data: Record<string, unknown>) => payableRow({ id, ...data } as Partial<Payable>)),
    createPayment: jest.fn(async (data: Record<string, unknown>) => {
      const p = paymentRow({ id: `paym-${createdPayments.length + 1}`, ...data } as Partial<PayablePayment>);
      createdPayments.push(p);
      return p;
    }),
    findPaymentById: jest.fn(async () => paymentRow()),
    findActivePayment: jest.fn(async () => null),
    findAllActivePayments: jest.fn(async () => [] as PayablePayment[]),
    updatePayment: jest.fn(async (_s, id: string, data: Record<string, unknown>) => paymentRow({ id, ...data } as Partial<PayablePayment>)),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const accountRepo = {
    findById: jest.fn(async () => (opts.expenseAccount === undefined ? expenseAcc() : opts.expenseAccount)),
  };
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = {
    canManagePayable: () => opts.canManage ?? true,
    canReadPayable: () => opts.canRead ?? true,
  };
  // Default: a SUPPLIER counterparty in THIS scope. `null` simulates a cross-scope/absent id (findById
  // returns null because it carries the scope where-clause — SEC-A1-1).
  const defaultCp = { id: 'cp-sup', userId: 'owner-1', unitId: 'unit-1', type: 'SUPPLIER' };
  const counterpartyRepo = {
    findById: jest.fn(async () => (opts.counterparty === undefined ? defaultCp : opts.counterparty)),
  };

  // INCR-INVENTORY D3(b): the AP→estoque bridge (Body 3). Mocked here — the real subledger idempotency
  // lives in InventoryService's own suite; here we assert PayableService DRIVES it with the right args.
  const inventoryService = {
    receiveStock: jest.fn(async () => ({ valueCents: 0 })),
    reverseStockForReceipt: jest.fn(async () => ({ totalReversedCents: 0 })),
  };

  const service = new PayableService(
    payableRepo as never,
    accountRepo as never,
    { postEntry, reverseEntry, findEntryBySource } as never,
    auditService as never,
    policy as never,
    counterpartyRepo as never,
    inventoryService as never,
  );
  return { service, payableRepo, accountRepo, auditService, postEntry, reverseEntry, findEntryBySource, counterpartyRepo, inventoryService };
}

/** A PayableService constructed WITHOUT the optional inventory dep (pre-Fase-B wiring state). */
function buildWithoutInventory() {
  const postEntry = jest.fn(async () => ({ id: 'entry-1' }));
  const payableRepo = {
    create: jest.fn(async (data: Record<string, unknown>) => payableRow({ id: 'pay-new', ...data } as Partial<Payable>)),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const accountRepo = { findById: jest.fn(async () => expenseAcc()) };
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = { canManagePayable: () => true, canReadPayable: () => true };
  const counterpartyRepo = { findById: jest.fn(async () => null) };
  const service = new PayableService(
    payableRepo as never,
    accountRepo as never,
    { postEntry } as never,
    auditService as never,
    policy as never,
    counterpartyRepo as never,
    // no inventoryService — the pre-wiring state
  );
  return { service, payableRepo, postEntry };
}

const createDto = {
  unitId: 'unit-1', supplierName: 'ACME', documentNumber: 'NF-100', description: 'Serviço',
  issueDate: '2026-06-10', dueDate: '2026-07-10', amountCents: 50000, expenseAccountId: 'exp-1',
};
const payDto = { unitId: 'unit-1', method: 'Pix', paidAt: '2026-07-05', amountCents: 50000 };

describe('PayableService.createPayable — recognition (D2)', () => {
  it('books D expenseAccount / C 2.1.2 keyed sourceType=ap.payable, sourceId=payableId', async () => {
    const { service, postEntry } = build();
    await service.createPayable(scope, createDto as never);

    expect(postEntry).toHaveBeenCalledTimes(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AP_PAYABLE_SOURCE_TYPE);
    expect(input.sourceId).toBe('pay-new'); // payableId, never a fabricated key
    expect(input.date).toBe('2026-06-10'); // competência = issueDate
    expect(input.lines).toContainEqual({ accountCode: '4.1', debitCents: 50000, creditCents: 0 });
    expect(input.lines).toContainEqual({ accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: 0, creditCents: 50000 });
    // Provenance seam (D6/F4): the nota flows into sourceDocument.
    expect(input.sourceDocument?.externalRef).toBe('NF-100');
    expect(input.sourceDocument?.documentDate).toBe('2026-06-10');
  });

  it('rejects a non-Expense contrapartida (gate D4)', async () => {
    const { service } = build({ expenseAccount: expenseAcc({ nature: 'Asset' }) });
    await expect(service.createPayable(scope, createDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a synthetic (non-leaf) expense account', async () => {
    const { service } = build({ expenseAccount: expenseAcc({ acceptsEntries: false }) });
    await expect(service.createPayable(scope, createDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('compensates the row (soft-delete + rename) when the recognition posting fails', async () => {
    const { service, postEntry, payableRepo } = build();
    postEntry.mockRejectedValueOnce(new Error('period closed'));
    await expect(service.createPayable(scope, createDto as never)).rejects.toThrow('period closed');
    // Compensation soft-deletes AND frees the business key via rename-on-delete.
    const comp = payableRepo.updatePayable.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(comp.status).toBe('CANCELLED');
    expect(comp.deletedAt).toBeInstanceOf(Date);
    expect(comp.documentNumber).toBe('deleted:pay-new:NF-100');
  });

  it('forbids without canManagePayable', async () => {
    const { service } = build({ canManage: false });
    await expect(service.createPayable(scope, createDto as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('PayableService.createPayable — counterparty link (INCR-COUNTERPARTY / SEC-A1-1)', () => {
  const dtoWithCp = { ...createDto, counterpartyId: 'cp-sup' };

  it('resolves counterpartyId RE-SCOPED and persists it on the row', async () => {
    const { service, payableRepo, counterpartyRepo } = build();
    await service.createPayable(scope, dtoWithCp as never);
    // findById is the SCOPED resolver — proves the id was checked against this tenant, not trusted.
    expect(counterpartyRepo.findById).toHaveBeenCalledWith(scope, 'cp-sup');
    const created = payableRepo.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.counterpartyId).toBe('cp-sup');
    expect(created.supplierName).toBe('ACME'); // snapshot preserved alongside the FK
  });

  it('rejects a counterpartyId of ANOTHER scope (findById → null ⇒ ValidationError, IDOR #1)', async () => {
    const { service, payableRepo } = build({ counterparty: null });
    await expect(service.createPayable(scope, dtoWithCp as never)).rejects.toBeInstanceOf(ValidationError);
    expect(payableRepo.create).not.toHaveBeenCalled();
  });

  it('rejects linking a payable to a CUSTOMER counterparty', async () => {
    const { service } = build({ counterparty: { id: 'cp-cus', userId: 'owner-1', unitId: 'unit-1', type: 'CUSTOMER' } });
    await expect(service.createPayable(scope, dtoWithCp as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('leaves counterpartyId null when none is supplied (nullable this increment, SEC-A1-5)', async () => {
    const { service, payableRepo, counterpartyRepo } = build();
    await service.createPayable(scope, createDto as never);
    expect(counterpartyRepo.findById).not.toHaveBeenCalled();
    const created = payableRepo.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.counterpartyId).toBeNull();
  });
});

describe('PayableService.registerPayment — settlement (D2/D3/D4)', () => {
  it('books D 2.1.2 / C method-account keyed sourceType=ap.payment, sourceId=paymentId (NOT payableId)', async () => {
    const { service, postEntry } = build();
    await service.registerPayment(scope, 'pay-1', payDto as never);

    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AP_PAYMENT_SOURCE_TYPE);
    expect(input.sourceId).toBe('paym-1'); // paymentId — the whole point of D3
    expect(input.sourceId).not.toBe('pay-1');
    expect(input.date).toBe('2026-07-05'); // data efetiva do débito
    expect(input.lines).toContainEqual({ accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: 50000, creditCents: 0 });
    expect(input.lines).toContainEqual({ accountCode: '1.1.1', debitCents: 0, creditCents: 50000 }); // Pix → Banco
  });

  it('Cash credits Caixa 1.1.3; unknown method REJECTS (closed map, D2)', async () => {
    const cash = build();
    await cash.service.registerPayment(scope, 'pay-1', { ...payDto, method: 'Cash' } as never);
    const input = (cash.postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.lines).toContainEqual({ accountCode: '1.1.3', debitCents: 0, creditCents: 50000 });

    const bad = build();
    await expect(
      bad.service.registerPayment(scope, 'pay-1', { ...payDto, method: 'Crypto' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(bad.postEntry).not.toHaveBeenCalled(); // rejected before any ledger write
  });

  it('TOCTOU: two parallel payments → exactly one succeeds (claimForPayment CAS)', async () => {
    const { service, postEntry, payableRepo } = build({ claimResults: [1, 0] });
    const results = await Promise.allSettled([
      service.registerPayment(scope, 'pay-1', payDto as never),
      service.registerPayment(scope, 'pay-1', payDto as never),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);
    // Exactly one settlement posted, one payment row created.
    expect(postEntry).toHaveBeenCalledTimes(1);
    expect(payableRepo.createPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects a partial amount (full-payment MVP guard, F2)', async () => {
    const { service } = build();
    await expect(
      service.registerPayment(scope, 'pay-1', { ...payDto, amountCents: 30000 } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects paying a non-OPEN payable', async () => {
    const { service, payableRepo } = build();
    payableRepo.findByIdWithPayments.mockResolvedValueOnce({ ...payableRow({ status: 'PAID' }), payments: [] });
    await expect(service.registerPayment(scope, 'pay-1', payDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('does NOT revert the claim after a successful post (never revert over a booked ledger)', async () => {
    const { service, payableRepo } = build();
    // finalize tx fails AFTER the post; the money is booked → must not revert to OPEN.
    payableRepo.runTransaction.mockRejectedValueOnce(new Error('finalize crash'));
    await expect(service.registerPayment(scope, 'pay-1', payDto as never)).rejects.toThrow('finalize crash');
    const reverts = payableRepo.updatePayable.mock.calls.filter((c) => (c[2] as { status?: string }).status === 'OPEN');
    expect(reverts).toHaveLength(0);
  });

  it('emits payable.payment_registered exactly once on the happy path (CAS won)', async () => {
    const { service, auditService } = build(); // markPaidIfPaying defaults to 1 (won)
    await service.registerPayment(scope, 'pay-1', payDto as never);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.filter((c) => c[2].eventType === 'payable.payment_registered')).toHaveLength(1);
  });

  it('does NOT emit when a concurrent reconcile already finalized the payment (CAS lost, Scenario B)', async () => {
    const { service, auditService } = build({ markResults: [0] }); // PAYING→PAID CAS matched 0 rows
    await service.registerPayment(scope, 'pay-1', payDto as never);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.filter((c) => c[2].eventType === 'payable.payment_registered')).toHaveLength(0);
  });
});

describe('PayableService.cancelPayable — reverse recognition (F6/ACC-018/D3)', () => {
  it('reverses the recognition and renames the business key (rename-on-delete)', async () => {
    const { service, reverseEntry, payableRepo } = build({
      findEntryBySource: (type) => (type === AP_PAYABLE_SOURCE_TYPE ? { id: 'rec-1' } : null),
    });
    await service.cancelPayable(scope, 'pay-1', { unitId: 'unit-1', reversalDate: '2026-07-14', reason: 'erro' } as never);

    expect(reverseEntry).toHaveBeenCalledTimes(1);
    expect((reverseEntry.mock.calls[0] as unknown[])[1]).toMatchObject({ lancamentoId: 'rec-1', reversalPostingDate: '2026-07-14' });
    const upd = payableRepo.updatePayable.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(upd.status).toBe('CANCELLED');
    expect(upd.documentNumber).toBe('deleted:pay-1:NF-100'); // frees the @@unique for a re-create
  });

  it('is idempotent when already cancelled', async () => {
    const { service, reverseEntry, payableRepo } = build();
    payableRepo.findByIdWithPayments.mockResolvedValueOnce({ ...payableRow({ status: 'CANCELLED' }), payments: [] });
    await service.cancelPayable(scope, 'pay-1', { unitId: 'unit-1', reversalDate: '2026-07-14' } as never);
    expect(reverseEntry).not.toHaveBeenCalled();
  });

  it('refuses to cancel a PAID payable (must undo the payment first)', async () => {
    const { service, payableRepo } = build();
    payableRepo.findByIdWithPayments.mockResolvedValueOnce({ ...payableRow({ status: 'PAID' }), payments: [] });
    await expect(
      service.cancelPayable(scope, 'pay-1', { unitId: 'unit-1', reversalDate: '2026-07-14' } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('PayableService.cancelPayment — reverse settlement + reopen (net-zero on 2.1.2)', () => {
  it('reverses the settlement, cancels the payment, reopens the payable', async () => {
    const { service, reverseEntry, payableRepo } = build({
      findEntryBySource: (type) => (type === AP_PAYMENT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    await service.cancelPayment(scope, 'pay-1', 'paym-1', { unitId: 'unit-1', reversalDate: '2026-07-14' } as never);

    // reverseEntry swaps the legs → credits 2.1.2 back, netting the settlement to zero on 2.1.2.
    expect((reverseEntry.mock.calls[0] as unknown[])[1]).toMatchObject({ lancamentoId: 'set-1' });
    const paymentUpd = payableRepo.updatePayment.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(paymentUpd.status).toBe('CANCELLED');
    const payableUpd = payableRepo.updatePayable.mock.calls.at(-1)![2] as Record<string, unknown>;
    expect(payableUpd.status).toBe('OPEN'); // reopened
  });
});

describe('PayableService.reconcilePayables — re-drive safety net (D4/ADR §6.2)', () => {
  it('re-posts a missing recognition for a live payable', async () => {
    const { service, payableRepo, postEntry } = build();
    payableRepo.findAllActive.mockResolvedValueOnce([payableRow({ id: 'pay-1', status: 'OPEN' })]);
    // findEntryBySource returns null → recognition missing.
    const out = await service.reconcilePayables(scope);
    expect(out.recognitionsPosted).toBe(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AP_PAYABLE_SOURCE_TYPE);
    expect(input.sourceId).toBe('pay-1');
  });

  it('re-posts a missing settlement AND finalizes a PAYING payable', async () => {
    const { service, payableRepo, postEntry } = build();
    payableRepo.findAllActivePayments.mockResolvedValueOnce([paymentRow({ id: 'paym-1', payableId: 'pay-1' })]);
    payableRepo.findById.mockResolvedValue(payableRow({ id: 'pay-1', status: 'PAYING' }));
    const out = await service.reconcilePayables(scope);
    expect(out.settlementsPosted).toBe(1);
    expect(out.finalized).toBe(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AP_PAYMENT_SOURCE_TYPE);
    expect(input.sourceId).toBe('paym-1');
    // Finalized → payable moved PAYING→PAID via the atomic CAS (not an unconditional update).
    expect(payableRepo.markPaidIfPaying).toHaveBeenCalledWith(expect.anything(), 'pay-1', expect.anything());
  });

  it('does NOT emit (nor count) when the finalize CAS loses to a concurrent finalizer', async () => {
    // Preliminary read still says PAYING, but markPaidIfPaying returns 0 → someone else already
    // flipped PAYING→PAID and emitted. This pass must NOT double-emit (the exactly-once gate).
    const { service, payableRepo, auditService } = build({
      markResults: [0],
      findEntryBySource: (type) => (type === AP_PAYMENT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    payableRepo.findAllActivePayments.mockResolvedValueOnce([paymentRow({ id: 'paym-1', payableId: 'pay-1', entryId: null })]);
    payableRepo.findById.mockResolvedValue(payableRow({ id: 'pay-1', status: 'PAYING' }));
    const out = await service.reconcilePayables(scope);

    expect(out.finalized).toBe(0);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    expect(calls.find((c) => c[2].eventType === 'payable.payment_registered')).toBeFalsy();
  });

  it('re-emits payable.payment_registered when finalizing a crash-stranded PAYING payable', async () => {
    const { service, payableRepo, auditService, postEntry } = build({
      findEntryBySource: (type) => (type === AP_PAYMENT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    // Settlement already posted (crash was AFTER the post, before the finalize tx) → no re-post.
    payableRepo.findAllActivePayments.mockResolvedValueOnce([paymentRow({ id: 'paym-1', payableId: 'pay-1', entryId: null })]);
    payableRepo.findById.mockResolvedValue(payableRow({ id: 'pay-1', status: 'PAYING' }));
    const out = await service.reconcilePayables(scope);

    expect(postEntry).not.toHaveBeenCalled(); // settlement existed
    expect(out.finalized).toBe(1);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string; payload: Record<string, unknown> }]>;
    const evt = calls.find((c) => c[2].eventType === 'payable.payment_registered');
    expect(evt).toBeTruthy();
    expect(evt![2].payload).toMatchObject({ payableId: 'pay-1', paymentId: 'paym-1', entryId: 'set-1' });
  });

  it('does NOT re-emit the domain audit for an already-finalized (PAID + linked) payment', async () => {
    const { service, payableRepo, auditService } = build({
      findEntryBySource: (type) => (type === AP_PAYMENT_SOURCE_TYPE ? { id: 'set-1' } : null),
    });
    payableRepo.findAllActivePayments.mockResolvedValueOnce([paymentRow({ id: 'paym-1', payableId: 'pay-1', entryId: 'set-1' })]);
    payableRepo.findById.mockResolvedValue(payableRow({ id: 'pay-1', status: 'PAID' }));
    const out = await service.reconcilePayables(scope);

    expect(out.finalized).toBe(0);
    const calls = auditService.append.mock.calls as unknown as Array<[unknown, unknown, { eventType: string }]>;
    const evt = calls.find((c) => c[2].eventType === 'payable.payment_registered');
    expect(evt).toBeFalsy(); // no double-emit across repeated passes
  });

  it('does NOT re-post when the recognition already exists (idempotent)', async () => {
    const { service, payableRepo, postEntry } = build({
      findEntryBySource: (type) => (type === AP_PAYABLE_SOURCE_TYPE ? { id: 'rec-1' } : null),
    });
    payableRepo.findAllActive.mockResolvedValueOnce([payableRow({ id: 'pay-1', status: 'OPEN' })]);
    const out = await service.reconcilePayables(scope);
    expect(out.recognitionsPosted).toBe(0);
    expect(postEntry).not.toHaveBeenCalled();
  });

  it('skips cancelled payables', async () => {
    const { service, payableRepo, postEntry } = build();
    payableRepo.findAllActive.mockResolvedValueOnce([payableRow({ id: 'pay-x', status: 'CANCELLED' })]);
    const out = await service.reconcilePayables(scope);
    expect(out.recognitionsPosted).toBe(0);
    expect(postEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// INCR-INVENTORY D3(b) — AP→estoque purchase bridge (A2c-3)
// ---------------------------------------------------------------------------

const inventoryDto = {
  unitId: 'unit-1', supplierName: 'Distribuidora', documentNumber: 'NF-777',
  description: 'Shampoo p/ revenda', issueDate: '2026-06-10', dueDate: '2026-07-10',
  amountCents: 30000, inventoryProductRef: 'prod-shampoo', inventoryQty: 10,
};

describe('CreatePayableSchema — inventory XOR (D3(b) / param-aceito-e-ignorado-e-bug)', () => {
  it('accepts an ordinary expense payable (expenseAccountId only)', () => {
    expect(CreatePayableSchema.safeParse(createDto).success).toBe(true);
  });

  it('accepts an inventory purchase (inventoryProductRef + inventoryQty only)', () => {
    expect(CreatePayableSchema.safeParse(inventoryDto).success).toBe(true);
  });

  it('rejects BOTH sides (expenseAccountId AND inventory pair)', () => {
    const both = { ...inventoryDto, expenseAccountId: 'exp-1' };
    expect(CreatePayableSchema.safeParse(both).success).toBe(false);
  });

  it('rejects NEITHER side (no expense account, no inventory pair)', () => {
    const neither = {
      unitId: 'unit-1', supplierName: 'ACME', description: 'x',
      issueDate: '2026-06-10', dueDate: '2026-07-10', amountCents: 30000,
    };
    expect(CreatePayableSchema.safeParse(neither).success).toBe(false);
  });

  it('rejects a HALF-supplied inventory pair (productRef without qty)', () => {
    const partial = { ...inventoryDto, inventoryQty: undefined };
    expect(CreatePayableSchema.safeParse(partial).success).toBe(false);
  });
});

describe('PayableService.createPayable — inventory purchase (D3(b))', () => {
  it('debits 1.1.6 Estoques (NOT an expense leaf) / credits 2.1.2, keyed sourceId=payableId', async () => {
    const { service, postEntry, accountRepo } = build();
    await service.createPayable(scope, inventoryDto as never);

    expect(postEntry).toHaveBeenCalledTimes(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AP_PAYABLE_SOURCE_TYPE);
    expect(input.sourceId).toBe('pay-new');
    expect(input.lines).toContainEqual({ accountCode: ESTOQUES_CODE, debitCents: 30000, creditCents: 0 });
    expect(input.lines).toContainEqual({ accountCode: FORNECEDORES_A_PAGAR_CODE, debitCents: 0, creditCents: 30000 });
    // No expense-account resolution happens for an inventory purchase.
    expect(accountRepo.findById).not.toHaveBeenCalled();
  });

  it('drives receiveStock with the TOTAL amountCents and sourceId=payableId (idempotency key)', async () => {
    const { service, inventoryService } = build();
    await service.createPayable(scope, inventoryDto as never);

    expect(inventoryService.receiveStock).toHaveBeenCalledTimes(1);
    const params = (inventoryService.receiveStock.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(params).toMatchObject({
      productRef: 'prod-shampoo',
      qty: 10,
      totalValueCents: 30000, // TOTAL, not per-unit — avoids per-unit rounding (D5/D6)
      sourceType: INVENTORY_INBOUND_SOURCE_TYPE,
      sourceId: 'pay-new', // payableId → the same purchase + a seed of the same lot value the SKU once (Gate 4)
    });
  });

  it('rejects an inventory purchase when the inventory service is not wired (fail loud, no row)', async () => {
    const { service } = buildWithoutInventory();
    await expect(service.createPayable(scope, inventoryDto as never)).rejects.toBeInstanceOf(ValidationError);
  });

  it('does NOT compensate the recognition when the INBOUND fails (reconcile re-drives)', async () => {
    const { service, inventoryService, payableRepo } = build();
    inventoryService.receiveStock.mockRejectedValueOnce(new Error('inbound crash'));
    // createPayable still resolves — the recognition is valid; the INBOUND converges via reconcile.
    await service.createPayable(scope, inventoryDto as never);
    const comps = payableRepo.updatePayable.mock.calls.filter(
      (c) => (c[2] as { status?: string }).status === 'CANCELLED',
    );
    expect(comps).toHaveLength(0);
  });
});

describe('PayableService.cancelPayable — inventory purchase REVERSAL at original cost (D3(b)/D8)', () => {
  it('reverses the received stock (sourceId=payableId, distinct reversal key) then the ledger', async () => {
    const { service, inventoryService, reverseEntry, payableRepo } = build({
      findEntryBySource: (type) => (type === AP_PAYABLE_SOURCE_TYPE ? { id: 'rec-inv' } : null),
    });
    payableRepo.findByIdWithPayments.mockResolvedValueOnce({
      ...payableRow({ inventoryProductRef: 'prod-shampoo', inventoryQty: 10, expenseAccountId: null }),
      payments: [],
    });

    await service.cancelPayable(scope, 'pay-1', { unitId: 'unit-1', reversalDate: '2026-07-14', reason: 'devolução' } as never);

    expect(inventoryService.reverseStockForReceipt).toHaveBeenCalledTimes(1);
    const params = (inventoryService.reverseStockForReceipt.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(params).toMatchObject({
      sourceType: INVENTORY_INBOUND_SOURCE_TYPE,
      sourceId: 'pay-1',
      reversalEventId: 'pay-1:cancel', // distinct from the receipt key (payableId)
    });
    // Ledger recognition still reversed (D 2.1.2 / C 1.1.6 at original cost).
    expect(reverseEntry).toHaveBeenCalledTimes(1);
  });
});

describe('PayableService.reconcilePayables — inventory crash-recovery (Gap 2 / Gate 8)', () => {
  it('posts the missing 1.1.6 debit for an inventory payable (NOT skipped on expenseAccountId=null) and re-drives the INBOUND', async () => {
    const { service, payableRepo, postEntry, inventoryService } = build();
    payableRepo.findAllActive.mockResolvedValueOnce([
      payableRow({ id: 'pay-inv', status: 'OPEN', expenseAccountId: null, inventoryProductRef: 'prod-shampoo', inventoryQty: 10, amountCents: 30000 }),
    ]);
    // findEntryBySource returns null → recognition missing (the crash window).
    const out = await service.reconcilePayables(scope);

    expect(out.recognitionsPosted).toBe(1);
    const input = (postEntry.mock.calls[0] as unknown[])[1] as PostEntryInput;
    expect(input.sourceType).toBe(AP_PAYABLE_SOURCE_TYPE);
    expect(input.sourceId).toBe('pay-inv');
    // Debit lands on 1.1.6 (tie-out: the posted debit == amountCents == what Σ(1.1.6) will carry).
    expect(input.lines).toContainEqual({ accountCode: ESTOQUES_CODE, debitCents: 30000, creditCents: 0 });
    // INBOUND re-driven idempotently by read-first on payableId.
    expect(inventoryService.receiveStock).toHaveBeenCalledTimes(1);
    const params = (inventoryService.receiveStock.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
    expect(params).toMatchObject({ sourceId: 'pay-inv', totalValueCents: 30000, sourceType: INVENTORY_INBOUND_SOURCE_TYPE });
  });
});
