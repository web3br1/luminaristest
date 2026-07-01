import { DataExchangeImportService, type IAccountReader, type IPoster } from '../DataExchangeImportService';
import type { IDataExchangeRepository } from '../../repositories/IDataExchangeRepository';
import type { AuditService } from '../AuditService';
import { AccountingPolicy } from '../../policies/AccountingPolicy';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import type { AccountingDataExchangeJob, AccountingDataExchangeRow } from 'generated/prisma';

jest.mock('../../../../lib/attachmentStorage', () => ({
  saveFile: jest.fn(async () => ({ storageKey: 'u/unit/job/rand_import.csv', sanitizedName: 'import.csv' })),
  resolveReadPath: jest.fn((k: string) => `/abs/${k}`),
  deleteFile: jest.fn(async () => undefined),
}));

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

/** Stateful in-memory repo so upload→commit flows end-to-end. */
function makeRepo() {
  const jobs = new Map<string, AccountingDataExchangeJob>();
  const rows = new Map<string, AccountingDataExchangeRow[]>();
  let seq = 0;

  const repo = {
    createJob: jest.fn(async (data: Record<string, unknown>) => {
      const id = `job-${++seq}`;
      const job = {
        id, status: 'VALIDATED', direction: 'IMPORT', kind: '', originalName: null, mimeType: null,
        sizeBytes: null, sha256: null, storageKey: null, totalRows: 0, validRows: 0, invalidRows: 0,
        committedRows: 0, requestedById: 'owner-1', committedById: null, userId: 'owner-1', unitId: 'unit-1',
        createdAt: new Date('2026-07-01T00:00:00Z'), updatedAt: new Date('2026-07-01T00:00:00Z'), committedAt: null,
        ...data,
      } as AccountingDataExchangeJob;
      jobs.set(id, job);
      rows.set(id, []);
      return job;
    }),
    findJobById: jest.fn(async (_s: unknown, id: string) => jobs.get(id) ?? null),
    updateJob: jest.fn(async (_s: unknown, id: string, data: Record<string, unknown>) => {
      const job = { ...(jobs.get(id) as AccountingDataExchangeJob), ...data };
      jobs.set(id, job);
      return job;
    }),
    createRows: jest.fn(async (rs: Array<Record<string, unknown>>) => {
      const jobId = rs[0]?.jobId as string;
      const list = rows.get(jobId) ?? [];
      rs.forEach((r, i) => list.push({ id: `${jobId}-r${i}`, targetType: null, targetId: null, createdAt: new Date(), ...r } as AccountingDataExchangeRow));
      rows.set(jobId, list);
      return rs.length;
    }),
    findRowsByJob: jest.fn(async (_s: unknown, jobId: string, opts?: { status?: string }) =>
      (rows.get(jobId) ?? []).filter((r) => !opts?.status || r.status === opts.status)),
    updateRow: jest.fn(async (_s: unknown, id: string, data: Record<string, unknown>) => {
      for (const [, list] of rows) {
        const row = list.find((r) => r.id === id);
        if (row) Object.assign(row, data);
      }
    }),
    runTransaction: jest.fn((fn: (tx: never) => Promise<unknown>) => fn({} as never)),
  } as unknown as IDataExchangeRepository;

  return { repo, jobs, rows };
}

const accountReader: IAccountReader = {
  listAccounts: jest.fn(async () => [
    { id: 'a1', code: '1.1.01', acceptsEntries: true },
    { id: 'a2', code: '2.1.01', acceptsEntries: true },
    { id: 'a3', code: '1', acceptsEntries: false },
  ]),
};

type PostEntryArg = { sourceType?: string; sourceId?: string; lines: unknown[] };
function makePoster() {
  const createAccount = jest.fn(async (_s: unknown, dto: { code: string }) => ({ id: `acc-${dto.code}`, code: dto.code }));
  const postEntry = jest.fn<Promise<{ id: string }>, [unknown, PostEntryArg]>(async () => ({ id: 'entry-1' }));
  return { poster: { createAccount, postEntry } as unknown as IPoster, createAccount, postEntry };
}

const audit = { append: jest.fn(async () => undefined) } as unknown as AuditService;
const csv = (s: string) => ({ originalname: 'f.csv', mimetype: 'text/csv', buffer: Buffer.from(s, 'utf8') });

beforeEach(() => jest.clearAllMocks());

describe('DataExchangeImportService — chart of accounts', () => {
  it('creates new accounts and skips existing ones on commit', async () => {
    const { repo } = makeRepo();
    const { poster, createAccount } = makePoster();
    const svc = new DataExchangeImportService(repo, new AccountingPolicy(), audit, accountReader, poster);

    const job = await svc.uploadAndValidate(scope, 'IMPORT_CHART_OF_ACCOUNTS',
      csv('code,name,nature,acceptsEntries,parentCode\n3.1,Fornecedores,Liability,true,\n1.1.01,Banco,Asset,true,\n3.2,Outra,Liability,true,\n'));
    expect(job.validRows).toBe(3);

    const committed = await svc.commit(scope, job.id);
    expect(createAccount).toHaveBeenCalledTimes(2); // 3.1 and 3.2 new; 1.1.01 skipped
    expect(committed.committedRows).toBe(2);
    expect(committed.status).toBe('COMMITTED');
  });
});

describe('DataExchangeImportService — opening balances', () => {
  it('commits one balanced entry with sourceId=jobId', async () => {
    const { repo } = makeRepo();
    const { poster, postEntry } = makePoster();
    const svc = new DataExchangeImportService(repo, new AccountingPolicy(), audit, accountReader, poster);

    const job = await svc.uploadAndValidate(scope, 'IMPORT_OPENING_BALANCES',
      csv('accountCode,postingDate,description,debitCents,creditCents\n1.1.01,2026-01-01,Banco,100000,0\n2.1.01,2026-01-01,Capital,0,100000\n'));
    expect(job.validRows).toBe(2);

    await svc.commit(scope, job.id);
    expect(postEntry).toHaveBeenCalledTimes(1);
    const arg = postEntry.mock.calls[0][1];
    expect(arg.sourceType).toBe('ACCOUNTING_OPENING_BALANCE_IMPORT');
    expect(arg.sourceId).toBe(job.id);
    expect(arg.lines).toHaveLength(2);
  });
});

describe('DataExchangeImportService — journal entries', () => {
  it('posts one entry per group with sourceId=externalReference', async () => {
    const { repo } = makeRepo();
    const { poster, postEntry } = makePoster();
    const svc = new DataExchangeImportService(repo, new AccountingPolicy(), audit, accountReader, poster);

    const job = await svc.uploadAndValidate(scope, 'IMPORT_JOURNAL_ENTRIES',
      csv('entryKey,documentDate,postingDate,description,accountCode,debitCents,creditCents,lineDescription,externalReference\n' +
          'L1,2026-07-01,2026-07-01,Aporte,1.1.01,100000,0,,REF1\n' +
          'L1,2026-07-01,2026-07-01,Aporte,2.1.01,0,100000,,REF1\n' +
          'L2,2026-07-02,2026-07-02,Outro,1.1.01,5000,0,,REF2\n' +
          'L2,2026-07-02,2026-07-02,Outro,2.1.01,0,5000,,REF2\n'));
    expect(job.validRows).toBe(4);

    const res = await svc.commit(scope, job.id);
    expect(postEntry).toHaveBeenCalledTimes(2);
    expect(res.committedRows).toBe(4);
    const refs = postEntry.mock.calls.map((c) => c[1].sourceId).sort();
    expect(refs).toEqual(['REF1', 'REF2']);
  });

  it('is idempotent — a second commit does not re-post', async () => {
    const { repo } = makeRepo();
    const { poster, postEntry } = makePoster();
    const svc = new DataExchangeImportService(repo, new AccountingPolicy(), audit, accountReader, poster);

    const job = await svc.uploadAndValidate(scope, 'IMPORT_JOURNAL_ENTRIES',
      csv('entryKey,documentDate,postingDate,description,accountCode,debitCents,creditCents,lineDescription,externalReference\n' +
          'L1,2026-07-01,2026-07-01,Aporte,1.1.01,100000,0,,REF1\n' +
          'L1,2026-07-01,2026-07-01,Aporte,2.1.01,0,100000,,REF1\n'));

    await svc.commit(scope, job.id);
    expect(postEntry).toHaveBeenCalledTimes(1);
    await svc.commit(scope, job.id); // already COMMITTED
    expect(postEntry).toHaveBeenCalledTimes(1); // no re-post
  });

  it('derives a deterministic file-based sourceId when externalReference is blank (ACC blocker fix)', async () => {
    const fileCsv =
      'entryKey,documentDate,postingDate,description,accountCode,debitCents,creditCents,lineDescription,externalReference\n' +
      'L1,2026-07-01,2026-07-01,Aporte,1.1.01,100000,0,,\n' +
      'L1,2026-07-01,2026-07-01,Aporte,2.1.01,0,100000,,\n';

    const commitFileAndCaptureSourceId = async () => {
      const { repo } = makeRepo();
      const { poster, postEntry } = makePoster();
      const svc = new DataExchangeImportService(repo, new AccountingPolicy(), audit, accountReader, poster);
      const job = await svc.uploadAndValidate(scope, 'IMPORT_JOURNAL_ENTRIES', csv(fileCsv));
      await svc.commit(scope, job.id);
      return postEntry.mock.calls[0][1].sourceId;
    };

    const src1 = await commitFileAndCaptureSourceId();
    const src2 = await commitFileAndCaptureSourceId(); // separate job, identical file bytes
    // Never a NULL sourceId (the old `|| undefined` double-post), and stable across re-imports.
    expect(src1).toMatch(/^di:[a-f0-9]{40}$/);
    expect(src2).toBe(src1);
  });
});
