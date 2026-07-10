import { createHash } from 'node:crypto';
import { SpedGenerationService } from '../SpedGenerationService';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { ForbiddenError, ValidationError } from '../../../../lib/errors';
import type { SpedEcdRequestDto } from '../../dtos/SpedEcdDto';
import type { Account, AccountingDataExchangeJob } from 'generated/prisma';

// Capture the bytes handed to the disk store so we can assert on the produced file.
const savedBuffers: Buffer[] = [];
jest.mock('../../../../lib/attachmentStorage', () => ({
  saveFile: jest.fn(async (_o: string, _u: string, _j: string, _n: string, buffer: Buffer) => {
    savedBuffers.push(buffer);
    return { storageKey: 'u/unit/job/ecd.txt', sanitizedName: 'ecd.txt' };
  }),
  resolveReadPath: jest.fn((k: string) => `/abs/${k}`),
}));

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function makeAccount(over: Partial<Account>): Account {
  return {
    id: 'a', userId: 'owner-1', unitId: 'unit-1', code: '1', name: 'X', nature: 'Asset',
    acceptsEntries: true, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    deletedAt: null, ...over,
  } as Account;
}

const CAIXA = makeAccount({ id: 'caixa', code: '1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true });
const RECEITA = makeAccount({ id: 'rec', code: '3.1', name: 'Receita', nature: 'Revenue', acceptsEntries: true });
const GRUPO = makeAccount({ id: 'g', code: '1', name: 'ATIVO', nature: 'Asset', acceptsEntries: false });

function makeDto(over: Partial<SpedEcdRequestDto> = {}): SpedEcdRequestDto {
  return {
    unitId: 'unit-1',
    mappingVersion: 'v1',
    year: 2026,
    declarant: {
      nome: 'EMPRESA TESTE LTDA', cnpj: '11222333000181', uf: 'SP', codMun: '3550308',
      indSitIniPer: '0', indNire: '1', indFinEsc: '0', indGrandePorte: '0', tipEcd: '0',
      identMf: 'N', indEscCons: 'N', indCentralizada: '0', indMudancPc: '0',
    },
    book: { numOrd: '1', natLivr: 'DIARIO GERAL', dtExSocial: '2026-12-31' },
    signers: [
      { identNom: 'RESP', identCpfCnpj: '11222333000181', identQualif: 'Administrador', codAssin: '205', indRespLegal: 'S' },
      { identNom: 'CONTADOR', identCpfCnpj: '12345678909', identQualif: 'Contador', codAssin: '900', indCrc: 'SP1', indRespLegal: 'N' },
    ],
    ...over,
  } as SpedEcdRequestDto;
}

interface Mocks {
  ready?: boolean;
  canRead?: boolean;
}

function buildService(m: Mocks = {}) {
  const canRead = m.canRead ?? true;
  const ready = m.ready ?? true;

  const accountRepo = {
    findManyByUnit: jest.fn(async () => [GRUPO, CAIXA, RECEITA]),
  } as never;

  const groupByAccount = jest.fn(async (_s: unknown, _st: string[], opts?: { from?: Date; to?: Date }) => {
    // Opening (only `to`, no `from`) => zero opening. A movement in January only.
    if (opts?.from && opts.from.getUTCMonth() === 0) {
      return [
        { accountId: 'caixa', debitCents: 50000, creditCents: 0 },
        { accountId: 'rec', debitCents: 0, creditCents: 50000 },
      ];
    }
    return [];
  });
  const postingRepo = { groupByAccount } as never;

  const findManyForExport = jest.fn(async () => [
    {
      id: 'e1', entryNumber: 1, date: new Date('2026-01-15T00:00:00Z'), description: 'Venda',
      status: 'Posted',
      postings: [
        { debitCents: 50000, creditCents: 0, account: { code: '1.1', name: 'Caixa' } },
        { debitCents: 0, creditCents: 50000, account: { code: '3.1', name: 'Receita' } },
      ],
    },
  ]);
  const journalEntryRepo = { findManyForExport } as never;

  const referential = {
    coverage: jest.fn(async () => ({
      unitId: 'unit-1', mappingVersion: 'v1',
      unmappedAccounts: ready ? [] : [{ accountId: 'caixa', code: '1.1', name: 'Caixa', nature: 'Asset' }],
      totals: { leafAccountCount: 2, mappedCount: ready ? 2 : 1, unmappedCount: ready ? 0 : 1 },
      ready,
    })),
    listMappings: jest.fn(async () => [
      { accountId: 'caixa', referentialCode: '1.01.01.00.00', mappingVersion: 'v1' },
      { accountId: 'rec', referentialCode: '3.01.01.00.00', mappingVersion: 'v1' },
    ]),
  } as never;

  const reports = {
    balanceSheet: jest.fn(async () => ({
      assets: { accounts: [{ code: '1.1', name: 'Caixa', amountCents: '50000' }], totalCents: '50000' },
      liabilities: { accounts: [], totalCents: '0' },
      equity: { accounts: [], totalCents: '0' },
      netResultLine: { amountCents: '50000' },
    })),
    incomeStatement: jest.fn(async () => ({
      grossRevenue: { accounts: [{ code: '3.1', name: 'Receita', amountCents: '50000' }], totalCents: '50000' },
      revenueDeductions: { accounts: [], totalCents: '0' },
      expenses: { accounts: [], totalCents: '0' },
      netResult: { amountCents: '50000' },
    })),
  } as never;

  const policy = { canRead: jest.fn(() => canRead) } as never;

  const createJob = jest.fn(async (data: Record<string, unknown>) =>
    ({ id: 'job-1', storageKey: null, ...data } as unknown as AccountingDataExchangeJob));
  const updateJob = jest.fn(async (_s: unknown, _id: string, data: Record<string, unknown>) =>
    ({ id: 'job-1', kind: 'EXPORT_SPED_ECD', direction: 'EXPORT', status: 'EXPORTED', ...data } as unknown as AccountingDataExchangeJob));
  const runTransaction = jest.fn((fn: (tx: never) => Promise<unknown>) => fn({} as never));
  const repo = { createJob, updateJob, runTransaction } as never;

  const append = jest.fn(async () => undefined);
  const audit = { append } as never;

  const service = new SpedGenerationService(
    accountRepo, postingRepo, journalEntryRepo, referential, reports, policy, repo, audit,
  );
  return { service, createJob, groupByAccount, findManyForExport, append, policy };
}

/** Decode the produced file back to its lines (latin1, CRLF). */
function producedLines(): string[] {
  const buf = savedBuffers[savedBuffers.length - 1];
  return buf.toString('latin1').split('\r\n').filter(Boolean);
}

beforeEach(() => {
  savedBuffers.length = 0;
});

describe('SpedGenerationService.generate', () => {
  it('blocks with ValidationError + unmappedAccounts when coverage is incomplete (D5)', async () => {
    const { service, createJob } = buildService({ ready: false });
    await expect(service.generate(scope, makeDto())).rejects.toBeInstanceOf(ValidationError);
    // No file, no job when coverage fails.
    expect(createJob).not.toHaveBeenCalled();
    expect(savedBuffers).toHaveLength(0);
  });

  it('rejects with ForbiddenError when policy denies read (tenancy)', async () => {
    const { service } = buildService({ canRead: false });
    await expect(service.generate(scope, makeDto())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('reads the ledger with LEDGER_STATUSES (Posted/Reconciled/Reversed) — never Draft (D6)', async () => {
    const { service, groupByAccount, findManyForExport } = buildService();
    await service.generate(scope, makeDto());
    const statusesUsed = groupByAccount.mock.calls[0][1];
    expect(statusesUsed).toEqual(['Posted', 'Reconciled', 'Reversed']);
    expect(statusesUsed).not.toContain('Draft');
    expect((findManyForExport.mock.calls[0] as unknown[])[1]).toEqual(['Posted', 'Reconciled', 'Reversed']);
  });

  it('emits exactly 12 I150 (monthly, D11) and the blocks in order', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    const lines = producedLines();
    const i150 = lines.filter((l) => l.startsWith('|I150|'));
    expect(i150).toHaveLength(12);
    // First I150 is January, DT_INI = 01012026
    expect(i150[0]).toBe('|I150|01012026|31012026|');
    expect(lines[0].startsWith('|0000|')).toBe(true);
    expect(lines[lines.length - 1].startsWith('|9999|')).toBe(true);
  });

  it('the I155 movement of an account/month equals the sum of that account/month I250 partidas (E2)', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    const lines = producedLines();
    // Caixa (1.1) in January: I155 VL_DEB should be 500,00 (the single debit leg).
    const janI155Caixa = lines.find((l) => l.startsWith('|I155|1.1|'))!.slice(1, -1).split('|');
    expect(janI155Caixa[5]).toBe('500,00'); // VL_DEB
    // The I250 debit partida for Caixa is 500,00 as well.
    const i250Caixa = lines.find((l) => l.startsWith('|I250|1.1|'))!.slice(1, -1).split('|');
    expect(i250Caixa[3]).toBe('500,00'); // VL_DC
    expect(i250Caixa[4]).toBe('D');
  });

  it('is deterministic — two generations produce byte-identical sha256 (D8)', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    await service.generate(scope, makeDto());
    const [a, b] = savedBuffers;
    const h = (x: Buffer) => createHash('sha256').update(x).digest('hex');
    expect(h(a)).toBe(h(b));
  });

  it('records the sped.ecd_generated audit and writes NO ledger row (closing invariant)', async () => {
    const { service, append } = buildService();
    await service.generate(scope, makeDto());
    expect(append).toHaveBeenCalledTimes(1);
    const auditEvent = (append.mock.calls[0] as unknown[])[2] as { eventType: string };
    expect(auditEvent.eventType).toBe('sped.ecd_generated');
    // No posting/journal write methods exist on the injected repos — nothing to assert
    // beyond: the service never received a write-capable ledger repo. Read-only by construction.
  });

  it('serializes money as unsigned comma-decimal and dates without UTC shift', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    const lines = producedLines();
    const i200 = lines.find((l) => l.startsWith('|I200|'))!.slice(1, -1).split('|');
    expect(i200[2]).toBe('15012026'); // DT_LCTO literal slice
    expect(i200[3]).toBe('500,00'); // VL_LCTO
  });
});
