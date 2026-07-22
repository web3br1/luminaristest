import { CreateReceivableSchema, RegisterReceiptSchema } from '../ReceivableDto';
import { MAX_CENTS } from '../../models/money';

const validCreate = {
  unitId: 'unit-1', customerName: 'Cliente XPTO', documentNumber: 'FAT-1', description: 'x',
  issueDate: '2026-06-10', dueDate: '2026-07-10', amountCents: 50000, revenueAccountId: 'rev-1',
};

describe('CreateReceivableSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(CreateReceivableSchema.safeParse(validCreate).success).toBe(true);
  });

  it('rejects amountCents over MAX_CENTS (Int32 ceiling, ACC-014)', () => {
    expect(CreateReceivableSchema.safeParse({ ...validCreate, amountCents: MAX_CENTS + 1 }).success).toBe(false);
  });

  it('rejects zero / negative amount', () => {
    expect(CreateReceivableSchema.safeParse({ ...validCreate, amountCents: 0 }).success).toBe(false);
    expect(CreateReceivableSchema.safeParse({ ...validCreate, amountCents: -1 }).success).toBe(false);
  });

  it('rejects a non-calendar date (2026-02-30 rolls, so round-trip fails)', () => {
    expect(CreateReceivableSchema.safeParse({ ...validCreate, issueDate: '2026-02-30' }).success).toBe(false);
  });

  it('rejects unknown keys (.strict — a typo fails loud, not silently dropped)', () => {
    expect(CreateReceivableSchema.safeParse({ ...validCreate, amuntCents: 50000 }).success).toBe(false);
  });
});

describe('RegisterReceiptSchema', () => {
  const valid = { unitId: 'unit-1', method: 'Pix', receivedAt: '2026-07-05', amountCents: 50000 };

  it('accepts the closed set of methods', () => {
    for (const method of ['Cash', 'Pix', 'TED', 'Boleto']) {
      expect(RegisterReceiptSchema.safeParse({ ...valid, method }).success).toBe(true);
    }
  });

  it('rejects a method outside the closed map', () => {
    expect(RegisterReceiptSchema.safeParse({ ...valid, method: 'Crypto' }).success).toBe(false);
  });

  it('rejects amountCents over MAX_CENTS', () => {
    expect(RegisterReceiptSchema.safeParse({ ...valid, amountCents: MAX_CENTS + 1 }).success).toBe(false);
  });
});
