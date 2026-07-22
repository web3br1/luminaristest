// --- Mock the DynamicTable repository the loader reads through (factory). ---
const findTableByInternalName = jest.fn();
const findRowsByFieldValue = jest.fn();

jest.mock('../../../../../lib/factory', () => ({
  __esModule: true,
  getFactory: () => ({
    getDynamicTableRepository: () => ({ findTableByInternalName, findRowsByFieldValue }),
  }),
}));

import { loadSalePackageInfo } from '../salonSaleItems';

const ITEMS_TABLE_ID = 'tbl-items-1';

describe('loadSalePackageInfo — productLines (INCR-INVENTORY Body 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findTableByInternalName.mockResolvedValue({ id: ITEMS_TABLE_ID, internalName: 'saleItems' });
  });

  it('exposes ONLY Product lines (Service and Package excluded)', async () => {
    findRowsByFieldValue.mockResolvedValue([
      { data: { productId: 'p-1', quantity: 2, unitPrice: 50, saleId: 's' } },
      { data: { serviceId: 'sv-1', quantity: 1, unitPrice: 100, saleId: 's' } },
      { data: { packageId: 'pk-1', quantity: 1, saleId: 's' } },
      { data: { productId: 'p-2', quantity: 3, unitPrice: 10, saleId: 's' } },
    ]);
    const info = await loadSalePackageInfo('u1', 's');
    expect(info.productLines).toEqual([
      { productRef: 'p-1', qty: 2 },
      { productRef: 'p-2', qty: 3 },
    ]);
  });

  it('classifies a Product-typed line WITHOUT a productId as revenue but NOT a COGS line', async () => {
    findRowsByFieldValue.mockResolvedValue([
      { data: { type: 'Product', quantity: 4, unitPrice: 25, saleId: 's' } },
    ]);
    const info = await loadSalePackageInfo('u1', 's');
    expect(info.kind).toBe('Product');
    expect(info.revenueByNature.productReais).toBe(100); // still counts for revenue
    expect(info.productLines).toEqual([]); // cannot be valued in the subledger
  });

  it('returns an empty productLines for a pure-service sale', async () => {
    findRowsByFieldValue.mockResolvedValue([
      { data: { serviceId: 'sv-1', quantity: 1, unitPrice: 100, saleId: 's' } },
    ]);
    const info = await loadSalePackageInfo('u1', 's');
    expect(info.kind).toBe('Service');
    expect(info.productLines).toEqual([]);
  });

  it('returns an empty productLines for an all-Package sale', async () => {
    findRowsByFieldValue.mockResolvedValue([
      { data: { packageId: 'pk-1', quantity: 1, saleId: 's' } },
    ]);
    const info = await loadSalePackageInfo('u1', 's');
    expect(info.kind).toBe('Package');
    expect(info.productLines).toEqual([]);
  });

  it('returns an empty productLines when the tenant has no saleItems table', async () => {
    findTableByInternalName.mockResolvedValueOnce(null);
    const info = await loadSalePackageInfo('u1', 's');
    expect(info.productLines).toEqual([]);
  });

  it('returns an empty productLines when the sale has no items', async () => {
    findRowsByFieldValue.mockResolvedValue([]);
    const info = await loadSalePackageInfo('u1', 's');
    expect(info.productLines).toEqual([]);
  });
});
