import { CreatePayableSchema, RegisterPaymentSchema } from '../PayableDto';
import { MAX_CENTS } from '../../models/money';

const validCreate = {
  unitId: 'unit-1', supplierName: 'ACME', documentNumber: 'NF-1', description: 'x',
  issueDate: '2026-06-10', dueDate: '2026-07-10', amountCents: 50000, expenseAccountId: 'exp-1',
};

describe('CreatePayableSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(CreatePayableSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects amountCents over MAX_CENTS (Int32 ceiling, ACC-014)', () => {
    expect(CreatePayableSchema.safeParse({ ...validCreate, amountCents: MAX_CENTS + 1 }).success).toBe(false);
  });

  it('rejects zero / negative amount', () => {
    expect(CreatePayableSchema.safeParse({ ...validCreate, amountCents: 0 }).success).toBe(false);
    expect(CreatePayableSchema.safeParse({ ...validCreate, amountCents: -1 }).success).toBe(false);
  });

  it('rejects a non-calendar date (2026-02-30 rolls, so round-trip fails)', () => {
    expect(CreatePayableSchema.safeParse({ ...validCreate, issueDate: '2026-02-30' }).success).toBe(false);
  });

  it('rejects unknown keys (.strict — a typo fails loud, not silently dropped)', () => {
    expect(CreatePayableSchema.safeParse({ ...validCreate, amuntCents: 50000 }).success).toBe(false);
  });
});

describe('RegisterPaymentSchema', () => {
  const valid = { unitId: 'unit-1', method: 'Pix', paidAt: '2026-07-05', amountCents: 50000 };

  it('accepts the closed set of methods', () => {
    for (const method of ['Cash', 'Pix', 'TED', 'Boleto']) {
      expect(RegisterPaymentSchema.safeParse({ ...valid, method }).success).toBe(true);
    }
  });

  it('rejects a method outside the closed map', () => {
    expect(RegisterPaymentSchema.safeParse({ ...valid, method: 'Crypto' }).success).toBe(false);
  });

  it('rejects amountCents over MAX_CENTS', () => {
    expect(RegisterPaymentSchema.safeParse({ ...valid, amountCents: MAX_CENTS + 1 }).success).toBe(false);
  });
});
