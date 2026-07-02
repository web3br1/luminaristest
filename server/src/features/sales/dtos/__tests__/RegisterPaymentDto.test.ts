import { RegisterPaymentSchema } from '../RegisterPaymentDto';

/**
 * RegisterPaymentDto is the trust boundary (G2): it accepts ONLY the payment whitelist and REJECTS
 * any attempt to smuggle a frozen field — they are never silently stripped, so they can't reach the
 * write path.
 */
describe('RegisterPaymentSchema', () => {
  const valid = { tableId: 't1', saleId: 's1', paymentMethod: 'Pix' };

  it('accepts the whitelist (tableId, saleId, paymentMethod, optional paidAt/paymentReference)', () => {
    expect(RegisterPaymentSchema.safeParse(valid).success).toBe(true);
    expect(
      RegisterPaymentSchema.safeParse({
        ...valid,
        paidAt: '2026-06-26T10:00:00.000Z',
        paymentReference: 'NSU-1',
      }).success,
    ).toBe(true);
  });

  it.each([
    'status',
    'unitId',
    'customerId',
    'totalAmount',
    'subtotal',
    'discountAmount',
    'taxAmount',
    'saleItems',
    'date',
    'paidByUserId', // derived from auth, never accepted from the client
  ])('REJECTS a payload carrying the frozen field %s (strict, not stripped)', (frozen) => {
    const result = RegisterPaymentSchema.safeParse({ ...valid, [frozen]: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown paymentMethod', () => {
    expect(RegisterPaymentSchema.safeParse({ ...valid, paymentMethod: 'Bitcoin' }).success).toBe(false);
  });

  it.each(['Credit Card', 'Debit Card', 'Cash', 'Pix', 'Package Balance'])(
    'accepts the canonical paymentMethod %s',
    (paymentMethod) => {
      // Package Balance additionally requires packageId (Incremento G P5).
      const extra = paymentMethod === 'Package Balance' ? { packageId: 'pkg-1' } : {};
      expect(RegisterPaymentSchema.safeParse({ ...valid, paymentMethod, ...extra }).success).toBe(true);
    },
  );

  // --- packageId conditional (Incremento G P5) ---
  describe('packageId conditional', () => {
    it('Package Balance REQUIRES packageId', () => {
      expect(RegisterPaymentSchema.safeParse({ ...valid, paymentMethod: 'Package Balance' }).success).toBe(false);
      expect(
        RegisterPaymentSchema.safeParse({ ...valid, paymentMethod: 'Package Balance', packageId: 'pkg-1' }).success,
      ).toBe(true);
    });

    it.each(['Cash', 'Pix', 'Credit Card', 'Debit Card'])('%s FORBIDS packageId (no ambiguous payload)', (paymentMethod) => {
      expect(
        RegisterPaymentSchema.safeParse({ ...valid, paymentMethod, packageId: 'pkg-1' }).success,
      ).toBe(false);
    });
  });
});
