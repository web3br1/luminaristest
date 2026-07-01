import { DataExchangeExportService, type IReportReader } from '../DataExchangeExportService';
import type { IDataExchangeRepository } from '../../repositories/IDataExchangeRepository';
import type { CreateJobInput, UpdateJobInput } from '../../models/DataExchange.model';
import type { AuditService } from '../AuditService';
import { AccountingPolicy } from '../../policies/AccountingPolicy';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { parseTable } from '../../../../lib/spreadsheet';
import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
import type { AccountingDataExchangeJob } from 'generated/prisma';

jest.mock('../../../../lib/attachmentStorage', () => ({
  saveFile: jest.fn(async () => ({ storageKey: 'u/unit/job/rand_export.csv', sanitizedName: 'export.csv' })),
  resolveReadPath: jest.fn((key: string) => `/abs/${key}`),
  deleteFile: jest.fn(async () => undefined),
}));
import * as storage from '../../../../lib/attachmentStorage';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

function makeJob(over: Partial<AccountingDataExchangeJob> = {}): AccountingDataExchangeJob {
  return {
    id: 'job-1', userId: 'owner-1', unitId: 'unit-1', direction: 'EXPORT',
    kind: 'EXPORT_TRIAL_BALANCE', status: 'EXPORTED', originalName: null, mimeType: null,
    sizeBytes: null, sha256: null, storageKey: null, totalRows: 0, validRows: 0,
    invalidRows: 0, committedRows: 0, requestedById: 'owner-1', committedById: null,
    createdAt: new Date('2026-07-01T00:00:00Z'), updatedAt: new Date('2026-07-01T00:00:00Z'),
    committedAt: null, ...over,
  };
}

function makeRepo() {
  const store = new Map<string, AccountingDataExchangeJob>();
  const createJob = jest.fn(async (data: CreateJobInput) => {
    const job = makeJob({ ...data, id: 'job-1' } as Partial<AccountingDataExchangeJob>);
    store.set(job.id, job);
    return job;
  });
  const findJobById = jest.fn(async (_s: unknown, id: string) => store.get(id) ?? null);
  const updateJob = jest.fn(async (_s: unknown, id: string, data: UpdateJobInput) => {
    const job = { ...(store.get(id) as AccountingDataExchangeJob), ...data };
    store.set(id, job);
    return job;
  });
  const runTransaction = jest.fn((fn: (tx: never) => Promise<unknown>) => fn({} as never));
  const repo = { createJob, findJobById, updateJob, runTransaction } as unknown as IDataExchangeRepository;
  return { repo, createJob, findJobById };
}

function makeReports(): IReportReader {
  return {
    trialBalance: jest.fn(async () => ({
      unitId: 'unit-1',
      rows: [{ accountId: 'a1', code: '1.1.01', name: 'Banco', nature: 'Asset', debitCents: 100000, creditCents: 0, balanceCents: 100000 }],
      totals: { debitCents: 100000, creditCents: 0, balanceCents: 100000 },
      balanced: true,
    })),
    accountLedger: jest.fn(),
    balanceSheet: jest.fn(),
    incomeStatement: jest.fn(),
  } as unknown as IReportReader;
}

type AppendArgs = [unknown, unknown, { eventType: string; payload: Record<string, unknown> }];

describe('DataExchangeExportService (BE-INCR-6)', () => {
  const auditAppend = jest.fn<Promise<void>, AppendArgs>(async () => undefined);
  const audit = { append: auditAppend } as unknown as AuditService;

  beforeEach(() => jest.clearAllMocks());

  it('exports a trial balance to CSV, persists it, and audits export_generated', async () => {
    const { repo } = makeRepo();
    const svc = new DataExchangeExportService(makeReports(), new AccountingPolicy(), repo, audit);

    const res = await svc.export(scope, { kind: 'EXPORT_TRIAL_BALANCE', format: 'csv', unitId: 'unit-1' });

    expect(res.kind).toBe('EXPORT_TRIAL_BALANCE');
    expect(res.mimeType).toBe('text/csv');
    expect(res.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(storage.saveFile).toHaveBeenCalledTimes(1);

    const buf = (storage.saveFile as jest.Mock).mock.calls[0][4] as Buffer;
    const table = await parseTable(buf, 'csv');
    expect(table.headers).toEqual(['code', 'name', 'nature', 'debitCents', 'creditCents', 'balanceCents']);
    expect(table.rows[0]).toEqual(['1.1.01', 'Banco', 'Asset', '100000', '0', '100000']);

    expect(auditAppend).toHaveBeenCalledTimes(1);
    const input = auditAppend.mock.calls[0][2];
    expect(input.eventType).toBe('data_exchange.export_generated');
    expect(input.payload).toMatchObject({ direction: 'EXPORT', kind: 'EXPORT_TRIAL_BALANCE', totalRows: '1' });
  });

  it('exports a blank template (headers only, no report call)', async () => {
    const { repo } = makeRepo();
    const reports = makeReports();
    const svc = new DataExchangeExportService(reports, new AccountingPolicy(), repo, audit);

    await svc.export(scope, { kind: 'EXPORT_TEMPLATE', format: 'xlsx', unitId: 'unit-1', templateKind: 'IMPORT_JOURNAL_ENTRIES' });

    expect(reports.trialBalance).not.toHaveBeenCalled();
    const buf = (storage.saveFile as jest.Mock).mock.calls[0][4] as Buffer;
    const table = await parseTable(buf, 'xlsx');
    expect(table.headers).toContain('entryKey');
    expect(table.headers).toContain('externalReference');
    expect(table.rows).toHaveLength(0);
  });

  it('resolves an artifact path for download and NotFound on a missing job', async () => {
    const { repo } = makeRepo();
    const svc = new DataExchangeExportService(makeReports(), new AccountingPolicy(), repo, audit);

    await svc.export(scope, { kind: 'EXPORT_TRIAL_BALANCE', format: 'csv', unitId: 'unit-1' });
    const dl = await svc.getArtifactForDownload(scope, 'job-1');
    expect(dl.absPath).toContain('u/unit/job');
    expect(dl.mimeType).toBe('text/csv');

    await expect(svc.getArtifactForDownload(scope, 'nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects export when the policy denies (no actor)', async () => {
    const { repo, createJob } = makeRepo();
    const svc = new DataExchangeExportService(makeReports(), new AccountingPolicy(), repo, audit);
    const noActor = { ...scope, actorUserId: '' };

    await expect(
      svc.export(noActor, { kind: 'EXPORT_TRIAL_BALANCE', format: 'csv', unitId: 'unit-1' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(createJob).not.toHaveBeenCalled();
  });
});
