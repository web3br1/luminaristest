import { DynamicTableService } from '../DynamicTableService';
import { ValidationError } from '../../../../lib/errors';

/**
 * Trava intacta (Incremento D / G2): the GENERIC updateTableData path must keep blocking any
 * edit to a Finalized salon sale — including the status flips to Cancelled / Returned — because
 * the SalesModule preset carries `immutableAfter { status in [Finalized,Cancelled,Returned],
 * scope:'all' }`. The ONLY legitimate bypass is a server-orchestrated isSystem write
 * (SalesCancellationService). This test pins that the global lock is NOT loosened: a normal
 * (non-isSystem) update of a Finalized row is rejected.
 */
const user = { userId: 'u1', role: 'USER' } as any;

// Minimal schema replicating the SalesModule lock (status select + immutableAfter scope:'all').
const salesLikeSchema = {
  fields: [
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: ['Draft', 'Finalized', 'Cancelled', 'Returned'],
      required: true,
    },
    {
      name: 'paymentStatus',
      label: 'Payment Status',
      type: 'select',
      options: ['Paid', 'Pending'],
      required: false,
    },
  ],
  immutableAfter: [
    {
      condition: { field: 'status', op: 'in', value: ['Finalized', 'Cancelled', 'Returned'] },
      scope: 'all',
      errorMessage: 'Finalized, cancelled or returned sales cannot be edited.',
    },
  ],
};

function buildService() {
  const repository = {
    findTableByDataId: jest.fn(async () => ({
      id: 'tbl-sales',
      userId: 'u1',
      category: 'finance',
      schema: salesLikeSchema,
    })),
    findDataById: jest.fn(async () => ({
      id: 'sale-1',
      dynamicTableId: 'tbl-sales',
      data: { status: 'Finalized' },
    })),
    findTableById: jest.fn(async () => null),
  };
  const policy = {
    canView: jest.fn(() => true),
    canManageData: jest.fn(() => true),
  };
  const svc = new DynamicTableService(repository as any, policy as any);
  return { svc, repository, policy };
}

describe('DynamicTableService.updateTableData — immutableAfter trava (Finalized sale)', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['Cancelled', 'Returned', 'Draft'])(
    'blocks a generic (non-isSystem) Finalized → %s status flip with ValidationError',
    async (target) => {
      const { svc } = buildService();
      await expect(
        svc.updateTableData(user, 'sale-1', { data: { status: target } } as any),
      ).rejects.toBeInstanceOf(ValidationError);
    },
  );

  it('blocks a generic (non-isSystem) paymentStatus → Paid flip on a Finalized sale (D1 trava intact)', async () => {
    // The ONLY legitimate Paid transition is RegisterPaymentService's isSystem write; the generic
    // path must keep rejecting it because the whole row is locked once Finalized.
    const { svc } = buildService();
    await expect(
      svc.updateTableData(user, 'sale-1', { data: { paymentStatus: 'Paid' } } as any),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
