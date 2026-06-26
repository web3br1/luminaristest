// Mock the post-commit settlement bridge so the service test stays at the orchestration layer
// (the bridge has its own suite). We assert the service fires it AFTER the isSystem write.
const maybeSyncSalonSaleSettled = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock('../../../accounting/sync/bridges/SalonSaleSettlementBridge', () => ({
  __esModule: true,
  maybeSyncSalonSaleSettled: (...a: unknown[]) => maybeSyncSalonSaleSettled(...a),
}));
jest.mock('../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { RegisterPaymentService } from '../RegisterPaymentService';
import { NotFoundError, ValidationError } from '../../../../lib/errors';
import type { RegisterPaymentInput } from '../../dtos/RegisterPaymentDto';

const user = { userId: 'u1', role: 'USER' } as any;
const SALES_TABLE_ID = 'sales-table';

/** A finalized, not-yet-paid sale row owned by THIS tenant's sales table. */
function finalizedSaleRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    dynamicTableId: SALES_TABLE_ID,
    data: { status: 'Finalized', paymentStatus: 'Pending', unitId: 'unit-1', totalAmount: 250, ...over },
  };
}

function buildService(over: { dts?: any; repo?: any; pkg?: any } = {}) {
  const dynamicTableService = {
    updateTableData: jest.fn(async () => ({
      id: 'sale-1',
      data: { status: 'Finalized', paymentStatus: 'Paid', unitId: 'unit-1' },
    })),
    ...over.dts,
  };
  const repository = {
    findTableByInternalName: jest.fn(async () => ({ id: SALES_TABLE_ID, userId: 'u1', category: 'finance' })),
    findDataById: jest.fn(async () => finalizedSaleRow()),
    ...over.repo,
  };
  const packageBalanceService = {
    assertSufficient: jest.fn(async () => undefined),
    debitForConsumption: jest.fn(async () => undefined),
    ...over.pkg,
  };
  const svc = new RegisterPaymentService(
    dynamicTableService as any,
    repository as any,
    packageBalanceService as any,
  );
  return { svc, dynamicTableService, repository, packageBalanceService };
}

const baseInput: RegisterPaymentInput = {
  tableId: SALES_TABLE_ID,
  saleId: 'sale-1',
  paymentMethod: 'Pix',
};

describe('RegisterPaymentService.registerPayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('flips paymentStatus → Paid via an isSystem write of ONLY the whitelist (the trava bypass)', async () => {
    const { svc, dynamicTableService } = buildService();
    await svc.registerPayment(user, { ...baseInput, paymentReference: 'NSU-9' });

    expect(dynamicTableService.updateTableData).toHaveBeenCalledTimes(1);
    const [u, id, dto, opts] = dynamicTableService.updateTableData.mock.calls[0];
    expect(u).toBe(user);
    expect(id).toBe('sale-1');
    expect(opts).toEqual({ isSystem: true });
    // Whitelist ONLY: paymentStatus/paymentMethod/paidAt/paidByUserId/paymentReference.
    expect(dto.data).toEqual({
      paymentStatus: 'Paid',
      paymentMethod: 'Pix',
      paidAt: expect.any(String),
      paidByUserId: 'u1',
      paymentReference: 'NSU-9',
    });
    // Frozen fields are never present in the patch.
    for (const frozen of ['status', 'unitId', 'customerId', 'totalAmount', 'subtotal', 'discountAmount', 'taxAmount', 'date']) {
      expect(dto.data).not.toHaveProperty(frozen);
    }
  });

  it('uses the provided paidAt as the settlement date when given', async () => {
    const { svc, dynamicTableService } = buildService();
    await svc.registerPayment(user, { ...baseInput, paidAt: '2026-06-26T10:00:00.000Z' });
    const [, , dto] = dynamicTableService.updateTableData.mock.calls[0];
    expect(dto.data.paidAt).toBe('2026-06-26T10:00:00.000Z');
  });

  it('fires the post-commit settlement bridge with the authoritative tableId AND the updated row', async () => {
    const updated = { id: 'sale-1', data: { status: 'Finalized', paymentStatus: 'Paid', unitId: 'unit-1' } };
    const { svc } = buildService({ dts: { updateTableData: jest.fn(async () => updated) } });
    await svc.registerPayment(user, baseInput);

    expect(maybeSyncSalonSaleSettled).toHaveBeenCalledTimes(1);
    expect(maybeSyncSalonSaleSettled).toHaveBeenCalledWith(user, SALES_TABLE_ID, updated);
  });

  it('is idempotent: an already-Paid sale is NOT re-written (still re-fires the dedup-safe bridge)', async () => {
    const paidRow = finalizedSaleRow({ paymentStatus: 'Paid' });
    const { svc, dynamicTableService } = buildService({
      repo: { findDataById: jest.fn(async () => paidRow) },
    });
    const result = await svc.registerPayment(user, baseInput);

    expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
    expect(result).toBe(paidRow);
    // The bridge is still fired so a previously-failed settlement re-drives (postEntry dedupes).
    expect(maybeSyncSalonSaleSettled).toHaveBeenCalledWith(user, SALES_TABLE_ID, paidRow);
  });

  describe('guards', () => {
    it('rejects a non-Finalized sale (ValidationError) — no write, no bridge', async () => {
      const { svc, dynamicTableService } = buildService({
        repo: { findDataById: jest.fn(async () => finalizedSaleRow({ status: 'Draft' })) },
      });
      await expect(svc.registerPayment(user, baseInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
      expect(maybeSyncSalonSaleSettled).not.toHaveBeenCalled();
    });

    it('sales table not installed → NotFoundError', async () => {
      const { svc } = buildService({ repo: { findTableByInternalName: jest.fn(async () => null) } });
      await expect(svc.registerPayment(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('cross-tenant sale (dynamicTableId ≠ caller sales table) → NotFoundError, no write', async () => {
      const { svc, dynamicTableService } = buildService({
        repo: {
          findDataById: jest.fn(async () => ({
            id: 'sale-1',
            dynamicTableId: 'someone-else-sales',
            data: { status: 'Finalized', paymentStatus: 'Pending', unitId: 'unit-1' },
          })),
        },
      });
      await expect(svc.registerPayment(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
    });

    it('client tableId mismatch (≠ resolved sales table) → NotFoundError', async () => {
      const { svc } = buildService();
      await expect(
        svc.registerPayment(user, { ...baseInput, tableId: 'wrong-table' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('missing sale → NotFoundError', async () => {
      const { svc } = buildService({ repo: { findDataById: jest.fn(async () => null) } });
      await expect(svc.registerPayment(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // --- Package Balance consumption (Incremento G P5) ---
  describe('Package Balance consumption', () => {
    const pbInput: RegisterPaymentInput = {
      tableId: SALES_TABLE_ID,
      saleId: 'sale-1',
      paymentMethod: 'Package Balance',
      packageId: 'pkg-1',
    };
    const saleWithCustomer = () => finalizedSaleRow({ customerId: 'cust-1' });

    it('Cash/Pix/Card NEVER touch the package balance (regression)', async () => {
      const { svc, packageBalanceService } = buildService();
      await svc.registerPayment(user, baseInput); // Pix
      expect(packageBalanceService.assertSufficient).not.toHaveBeenCalled();
      expect(packageBalanceService.debitForConsumption).not.toHaveBeenCalled();
    });

    it('BLOCKS (ValidationError) when balance is insufficient — no write, no settlement, no debit', async () => {
      const { svc, dynamicTableService, packageBalanceService } = buildService({
        repo: { findDataById: jest.fn(async () => saleWithCustomer()) },
        pkg: {
          assertSufficient: jest.fn(async () => {
            throw new ValidationError('saldo insuficiente');
          }),
          debitForConsumption: jest.fn(async () => undefined),
        },
      });
      await expect(svc.registerPayment(user, pbInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
      expect(maybeSyncSalonSaleSettled).not.toHaveBeenCalled();
      expect(packageBalanceService.debitForConsumption).not.toHaveBeenCalled();
    });

    it('with sufficient balance: marks Paid, then debits ONCE (post-commit) with cents', async () => {
      const { svc, dynamicTableService, packageBalanceService } = buildService({
        repo: { findDataById: jest.fn(async () => saleWithCustomer()) },
      });
      await svc.registerPayment(user, pbInput);
      expect(packageBalanceService.assertSufficient).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 'unit-1' }),
        'cust-1',
        'pkg-1',
        25000,
      );
      expect(dynamicTableService.updateTableData).toHaveBeenCalledTimes(1);
      expect(packageBalanceService.debitForConsumption).toHaveBeenCalledTimes(1);
      expect(packageBalanceService.debitForConsumption).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: 'unit-1' }),
        { customerId: 'cust-1', packageId: 'pkg-1', saleId: 'sale-1', amountCents: 25000 },
      );
    });

    it('idempotent re-drive (already Paid): re-fires debit, never re-writes', async () => {
      const paidRow = finalizedSaleRow({ paymentStatus: 'Paid', customerId: 'cust-1' });
      const { svc, dynamicTableService, packageBalanceService } = buildService({
        repo: { findDataById: jest.fn(async () => paidRow) },
      });
      await svc.registerPayment(user, pbInput);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
      expect(packageBalanceService.debitForConsumption).toHaveBeenCalledTimes(1);
    });

    it('NON-FATAL debit: a post-commit debit failure does not throw (payment already committed)', async () => {
      const { svc } = buildService({
        repo: { findDataById: jest.fn(async () => saleWithCustomer()) },
        pkg: {
          assertSufficient: jest.fn(async () => undefined),
          debitForConsumption: jest.fn(async () => {
            throw new Error('balance store down');
          }),
        },
      });
      await expect(svc.registerPayment(user, pbInput)).resolves.toBeDefined();
    });
  });
});
