/**
 * ReferentialCatalogService — RFB referential CATALOG import + lookup (BE-INCR-9B Track B).
 *
 * Gates owned by this slice (mocked repo/policy):
 *  - policy-first: canManageReferential (import) / canReadReferential (lookup) → ForbiddenError;
 *  - import is ALL-OR-NOTHING: a header error, any row error, or an empty file rejects the whole
 *    upload BEFORE any write (no partial catalog);
 *  - happy import upserts every row inside ONE tx, stamps the request layoutVersion, returns a
 *    summary (analytic/synthetic counts);
 *  - the service INVENTS NO code — content comes only from the parsed file;
 *  - lookup passes the query filter through to the repo.
 *
 * CSV bytes are built inline (the parser + spreadsheet lib are proven separately); this suite is
 * about the service's orchestration + gates, not CSV parsing.
 */
import { ReferentialCatalogService } from '../ReferentialCatalogService';
import { ForbiddenError, ValidationError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

const TX = { __tx: true };

const csv = (body: string): { originalname: string; buffer: Buffer } => ({
  originalname: 'catalog.csv',
  buffer: Buffer.from(body, 'utf8'),
});

const GOOD_CSV = ['code,name,isAnalytic,parentCode', '1,Ativo,false,', '1.01.01,Caixa,true,1'].join('\n');

function build(over: { repo?: Record<string, unknown>; policy?: Record<string, unknown> } = {}) {
  const repo = {
    upsert: jest.fn(async () => ({ id: 'cat-1' })),
    findByVersionAndCode: jest.fn(async () => null),
    countByVersion: jest.fn(async () => 0),
    findManyByVersion: jest.fn(async () => []),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(TX)),
    ...over.repo,
  };
  const policy = {
    canManageReferential: jest.fn(() => true),
    canReadReferential: jest.fn(() => true),
    ...over.policy,
  };
  const svc = new ReferentialCatalogService(repo as never, policy as never);
  return { svc, repo, policy };
}

describe('ReferentialCatalogService.import', () => {
  beforeEach(() => jest.clearAllMocks());

  it('policy-first: denies without canManageReferential (no parse, no write)', async () => {
    const { svc, repo } = build({ policy: { canManageReferential: () => false } });
    await expect(svc.import(scope, '2025', csv(GOOD_CSV))).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.runTransaction).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('happy path: upserts every row in ONE tx, stamps layoutVersion, returns the summary', async () => {
    const { svc, repo } = build();
    const result = await svc.import(scope, '2025', csv(GOOD_CSV));
    expect(repo.runTransaction).toHaveBeenCalledTimes(1);
    expect(repo.upsert).toHaveBeenCalledTimes(2);
    expect(repo.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ layoutVersion: '2025', code: '1', name: 'Ativo', isAnalytic: false }),
      TX,
    );
    expect(repo.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ layoutVersion: '2025', code: '1.01.01', isAnalytic: true, parentCode: '1' }),
      TX,
    );
    expect(result).toEqual({
      layoutVersion: '2025',
      totalRows: 2,
      imported: 2,
      analyticCount: 1,
      syntheticCount: 1,
    });
  });

  it('header error → ValidationError, nothing written', async () => {
    const { svc, repo } = build();
    await expect(svc.import(scope, '2025', csv('code,name\n1,Ativo'))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.runTransaction).not.toHaveBeenCalled();
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('any row error → whole file rejected (all-or-nothing), nothing written', async () => {
    const bad = ['code,name,isAnalytic', '1.01.01,Caixa,true', '1.01.02,Bancos,sim'].join('\n');
    const { svc, repo } = build();
    await expect(svc.import(scope, '2025', csv(bad))).rejects.toBeInstanceOf(ValidationError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('empty catalog file → ValidationError', async () => {
    const { svc, repo } = build();
    await expect(svc.import(scope, '2025', csv('code,name,isAnalytic'))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('re-import uses upsert (idempotent by @@unique — never a create/P2002)', async () => {
    const { svc, repo } = build();
    await svc.import(scope, '2025', csv(GOOD_CSV));
    await svc.import(scope, '2025', csv(GOOD_CSV)); // second run must not throw
    expect(repo.upsert).toHaveBeenCalledTimes(4);
  });
});

describe('ReferentialCatalogService.lookup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('denies without canReadReferential', async () => {
    const { svc } = build({ policy: { canReadReferential: () => false } });
    await expect(svc.lookup(scope, '2025')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('passes the query filter through to the repo', async () => {
    const { svc, repo } = build();
    await svc.lookup(scope, '2025', { q: 'caixa', analyticOnly: true });
    expect(repo.findManyByVersion).toHaveBeenCalledWith('2025', { q: 'caixa', analyticOnly: true });
  });
});
