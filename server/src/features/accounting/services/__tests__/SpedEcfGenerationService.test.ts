import { SpedEcfGenerationService } from '../SpedEcfGenerationService';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { ForbiddenError, ValidationError } from '../../../../lib/errors';
import type { SpedEcfRequestDto } from '../../dtos/SpedEcfDto';
import type { Account, AccountingDataExchangeJob } from 'generated/prisma';

// Capture the bytes handed to the disk store so we can assert on the produced file.
const savedBuffers: Buffer[] = [];
jest.mock('../../../../lib/attachmentStorage', () => ({
  saveFile: jest.fn(async (_o: string, _u: string, _j: string, _n: string, buffer: Buffer) => {
    savedBuffers.push(buffer);
    return { storageKey: 'u/unit/job/ecf.txt', sanitizedName: 'ecf.txt' };
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

const GRUPO_REC = makeAccount({ id: 'g3', code: '3', name: 'Receita', nature: 'Revenue', acceptsEntries: false });
const SERVICO = makeAccount({ id: 'rec31', code: '3.1', name: 'Receita de Serviços', nature: 'Revenue', acceptsEntries: true });
const REVENDA = makeAccount({ id: 'rec33', code: '3.3', name: 'Receita de Revenda', nature: 'Revenue', acceptsEntries: true });
const REC_FIN = makeAccount({ id: 'rec39', code: '3.9', name: 'Receita Financeira', nature: 'Revenue', acceptsEntries: true });

function makeDto(over: Partial<SpedEcfRequestDto> = {}): SpedEcfRequestDto {
  return {
    unitId: 'unit-1',
    year: 2025,
    declarant: {
      cnpj: '11222333000181', nome: 'SALAO TESTE LTDA', codNat: '2062', cnaeFiscal: '9602501',
      endereco: 'RUA DAS FLORES', num: '100', bairro: 'CENTRO', uf: 'DF', codMun: '5300108',
      cep: '70000000', numTel: '6133334444', email: 'salao@teste.com',
    },
    fiscal: { indAliqCsll: '1', indRecReceita: '2' },
    signers: [
      { identNom: 'CONTADOR', identCpfCnpj: '12345678900', identQualif: '900', indCrc: '1DF123', email: 'c@d.com', fone: '6133334444' },
      { identNom: 'SOCIO', identCpfCnpj: '98765432100', identQualif: '205', email: 's@d.com', fone: '6133335555' },
    ],
    ...over,
  } as SpedEcfRequestDto;
}

interface Mocks {
  canRead?: boolean;
  accounts?: Account[];
  extraRevenueMove?: boolean; // add movement on a non-3.1/3.3 revenue account
}

function buildService(m: Mocks = {}) {
  const canRead = m.canRead ?? true;
  const accounts = m.accounts ?? [GRUPO_REC, SERVICO, REVENDA];

  const accountRepo = { findManyByUnit: jest.fn(async () => accounts) } as never;

  const groupByAccount = jest.fn(
    async (_s: unknown, _st: string[], opts?: { from?: Date; to?: Date }) => {
      const toM = opts?.to?.getUTCMonth();
      const fromM = opts?.from?.getUTCMonth();
      const isYear = fromM === 0 && toM === 11;
      const rows = [
        // 3.1 serviço: 150k/tri (600k ano); 3.3 revenda: 50k/tri (200k ano). Crédito líquido.
        { accountId: 'rec31', debitCents: 0, creditCents: isYear ? 60000000 : 15000000 },
        { accountId: 'rec33', debitCents: 0, creditCents: isYear ? 20000000 : 5000000 },
      ];
      if (m.extraRevenueMove) {
        rows.push({ accountId: 'rec39', debitCents: 0, creditCents: isYear ? 4000000 : 1000000 });
      }
      return rows;
    },
  );
  const postingRepo = { groupByAccount } as never;

  const policy = { canRead: jest.fn(() => canRead) } as never;

  const createJob = jest.fn(async (data: Record<string, unknown>) =>
    ({ id: 'job-1', storageKey: null, ...data } as unknown as AccountingDataExchangeJob));
  const updateJob = jest.fn(async (_s: unknown, _id: string, data: Record<string, unknown>) =>
    ({ id: 'job-1', kind: 'EXPORT_SPED_ECF', direction: 'EXPORT', status: 'EXPORTED', ...data } as unknown as AccountingDataExchangeJob));
  const runTransaction = jest.fn((fn: (tx: never) => Promise<unknown>) => fn({} as never));
  const repo = { createJob, updateJob, runTransaction } as never;

  const append = jest.fn(async () => undefined);
  const audit = { append } as never;

  const service = new SpedEcfGenerationService(accountRepo, postingRepo, policy, repo, audit);
  return { service, createJob, updateJob, groupByAccount, append, policy };
}

/** Decode the produced file back to its lines (latin1, CRLF). */
function producedLines(): string[] {
  const buf = savedBuffers[savedBuffers.length - 1];
  return buf.toString('latin1').split('\r\n').filter(Boolean);
}

beforeEach(() => {
  savedBuffers.length = 0;
});

describe('SpedEcfGenerationService.generate', () => {
  it('rejects with ForbiddenError when policy denies read', async () => {
    const { service, createJob } = buildService({ canRead: false });
    await expect(service.generate(scope, makeDto())).rejects.toBeInstanceOf(ForbiddenError);
    expect(createJob).not.toHaveBeenCalled();
    expect(savedBuffers).toHaveLength(0);
  });

  it('blocks with ValidationError + unmappedRevenueAccounts when a Revenue account is not 3.1/3.3 (exhaustiveness gate)', async () => {
    // 3.9 Receita Financeira has movement but no presunção line → would escape the base.
    const { service, createJob } = buildService({
      accounts: [GRUPO_REC, SERVICO, REVENDA, REC_FIN],
      extraRevenueMove: true,
    });
    await expect(service.generate(scope, makeDto())).rejects.toBeInstanceOf(ValidationError);
    // The FAIL-1 guard: no silent drop, no file, no job.
    expect(createJob).not.toHaveBeenCalled();
    expect(savedBuffers).toHaveLength(0);
  });

  it('does NOT block when the extra Revenue account has ZERO movement', async () => {
    // 3.9 present but no movement (extraRevenueMove=false) → gate passes.
    const { service } = buildService({ accounts: [GRUPO_REC, SERVICO, REVENDA, REC_FIN] });
    await expect(service.generate(scope, makeDto())).resolves.toBeDefined();
  });

  it('segregates receita bruta by activity per trimester and records an EXPORT_SPED_ECF job', async () => {
    const { service, createJob, append } = buildService();
    await service.generate(scope, makeDto());

    const lines = producedLines();
    // Four quarterly periods (D3).
    expect(lines.filter((l) => l.startsWith('|P030|'))).toHaveLength(4);
    // 3.1 → P200(8) 32% IRPJ & P400(4) 32% CSLL; 3.3 → P200(4) 8% & P400(2) 12%.
    expect(lines).toContain('|P200|8||150000,00|');
    expect(lines).toContain('|P400|4||150000,00|');
    expect(lines).toContain('|P200|4||50000,00|');
    expect(lines).toContain('|P400|2||50000,00|');
    // Job carries the ECF kind and the file metadata.
    expect(createJob).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'EXPORT_SPED_ECF', direction: 'EXPORT', status: 'EXPORTED', mimeType: 'text/plain',
    }));
    // Audit event in the same tx.
    expect(append).toHaveBeenCalledWith(
      expect.anything(), scope,
      expect.objectContaining({ eventType: 'sped.ecf_generated', targetType: 'data_exchange_job' }),
    );
  });

  it('emits 0010 as Lucro Presumido (FORMA_TRIB=5, FORMA_APUR=T, TIP_ESC_PRE=C)', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    expect(producedLines()).toContain('|0010||N|5|T|01|PPPP||C||||2|');
  });

  it('writes ISO-8859-1 (latin1) bytes, CRLF-terminated, 0000…9999', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    const buf = savedBuffers[savedBuffers.length - 1];
    const text = buf.toString('latin1');
    expect(text.endsWith('\r\n')).toBe(true);
    const lines = producedLines();
    expect(lines[0].startsWith('|0000|')).toBe(true);
    expect(lines[lines.length - 1].startsWith('|9999|')).toBe(true);
  });

  it('is byte-deterministic (two generations produce the same sha256)', async () => {
    const { service } = buildService();
    await service.generate(scope, makeDto());
    const first = savedBuffers[savedBuffers.length - 1].toString('latin1');
    await service.generate(scope, makeDto());
    const second = savedBuffers[savedBuffers.length - 1].toString('latin1');
    expect(first).toBe(second);
  });

  it('never writes to the ledger (no posting/journal create-update): only reads + job metadata', async () => {
    const { service, groupByAccount } = buildService();
    await service.generate(scope, makeDto());
    // groupByAccount is a read; the service holds no posting/journal write repo at all.
    expect(groupByAccount).toHaveBeenCalled();
    // 1 year read (gate) + 4 quarter reads.
    expect(groupByAccount).toHaveBeenCalledTimes(5);
  });
});
