import { ReceiptService } from '../ReceiptService';
import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
import { htmlToPdf } from '../../../../lib/pdf';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { IJournalEntryRepository, JournalEntryWithPostings } from '../../repositories/IJournalEntryRepository';
import type { IAccountRepository } from '../../repositories/IAccountRepository';
import type { IAccountingPolicy } from '../../policies/IAccountingPolicy';
import type { Account } from 'generated/prisma';

// Mock the puppeteer wrapper so the unit test never launches Chromium; the real render
// is exercised by lib/__tests__/receiptHtml.test.ts + the browser sign-off.
jest.mock('../../../../lib/pdf', () => ({
  htmlToPdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
}));
const mockedHtmlToPdf = htmlToPdf as jest.Mock;

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

function makeEntry(over: Partial<JournalEntryWithPostings> = {}): JournalEntryWithPostings {
  return {
    id: 'entry-1',
    userId: 'u1',
    unitId: 'unit-1',
    date: new Date('2026-07-10T00:00:00.000Z'),
    description: 'Venda de serviço',
    status: 'Posted',
    sourceType: 'salon.sale.finalized',
    sourceId: 'sale-123',
    reversedById: null,
    createdById: 'u1',
    postedById: 'u1',
    fiscalYear: 2026,
    entryNumber: 7,
    createdAt: new Date('2026-07-10T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    postings: [
      { accountId: 'acc-caixa', debitCents: 123456, creditCents: 0 },
      { accountId: 'acc-receita', debitCents: 0, creditCents: 123456 },
    ],
    ...over,
  } as unknown as JournalEntryWithPostings;
}

function acc(over: Partial<Account>): Account {
  return { id: 'x', code: '0', name: 'n', nature: 'Asset', acceptsEntries: true } as unknown as Account;
}

function build(opts: { canRead?: boolean; entry?: JournalEntryWithPostings | null; accounts?: Record<string, Account | null> } = {}) {
  const entries: IJournalEntryRepository = {
    findById: jest.fn().mockResolvedValue(opts.entry === undefined ? makeEntry() : opts.entry),
  } as unknown as IJournalEntryRepository;

  const accountMap: Record<string, Account | null> = opts.accounts ?? {
    'acc-caixa': { ...acc({}), code: '1.1.1', name: 'Caixa' },
    'acc-receita': { ...acc({}), code: '3.1.1', name: 'Receita de Serviços' },
  };
  const accounts: IAccountRepository = {
    findById: jest.fn().mockImplementation((_s, id: string) => Promise.resolve(accountMap[id] ?? null)),
  } as unknown as IAccountRepository;

  const policy: IAccountingPolicy = {
    canRead: jest.fn().mockReturnValue(opts.canRead ?? true),
  } as unknown as IAccountingPolicy;

  return { service: new ReceiptService(entries, accounts, policy), entries, accounts, policy };
}

describe('ReceiptService.generateEntryReceipt', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a named PDF artifact for a posted entry', async () => {
    const { service } = build();
    const art = await service.generateEntryReceipt(scope, 'entry-1');

    expect(art.mimeType).toBe('application/pdf');
    expect(art.fileName).toBe('comprovante-lancamento-2026-7.pdf');
    expect(art.buffer.toString()).toContain('%PDF');
  });

  it('renders resolved account codes/names into the HTML handed to the PDF wrapper', async () => {
    const { service } = build();
    await service.generateEntryReceipt(scope, 'entry-1');

    const html = mockedHtmlToPdf.mock.calls[0][0] as string;
    expect(html).toContain('Caixa');
    expect(html).toContain('Receita de Serviços');
    expect(html).toContain('R$ 1.234,56');
  });

  it('shows a placeholder for a soft-deleted account instead of dropping the leg', async () => {
    const { service } = build({
      accounts: { 'acc-caixa': { ...acc({}), code: '1.1.1', name: 'Caixa' }, 'acc-receita': null },
    });
    await service.generateEntryReceipt(scope, 'entry-1');

    const html = mockedHtmlToPdf.mock.calls[0][0] as string;
    expect(html).toContain('(conta removida)');
  });

  it('throws ForbiddenError when the actor cannot read the ledger', async () => {
    const { service } = build({ canRead: false });
    await expect(service.generateEntryReceipt(scope, 'entry-1')).rejects.toBeInstanceOf(ForbiddenError);
    expect(mockedHtmlToPdf).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the entry does not exist in scope', async () => {
    const { service } = build({ entry: null });
    await expect(service.generateEntryReceipt(scope, 'missing')).rejects.toBeInstanceOf(NotFoundError);
  });
});
