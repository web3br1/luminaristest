/**
 * AgingReportService — aging / posição por contraparte (INCR-AGING), read-only, FIRST-CLASS PRISMA.
 *
 * What is mocked: the PAYABLE + RECEIVABLE repositories and the POLICY (the injected collaborators).
 * No prisma client is needed — the report service never opens a transaction; it only reads through the
 * (mocked) `findOutstanding`. The repository's `findOutstanding` WHERE-clause filter (exclui
 * PAID/RECEIVED, CANCELLED e soft-deleted; inclui PAYING/RECEIVING) is proved against a REAL SQLite DB
 * in AgingOutstanding.integration.test.ts — the concern of sintetico-nao-cobre-formato-de-dado-real.
 *
 * These tests pin:
 *  - a linha cai na faixa certa pela as_of (a vencer × 1–30 × 31–60 × 61–90 × >90);
 *  - dueDate == as_of ⇒ "a vencer" (regra dueDate ≥ as_of), atraso começa em 1 dia;
 *  - agrupa por counterpartyId; TODAS as linhas com counterpartyId NULL colapsam no grupo
 *    "(Sem contraparte)";
 *  - INVARIANTE: total geral === Σ faixas === Σ grupos (inteiro exato);
 *  - as_of overridável muda os baldes;
 *  - AP e AR (subrazão certo é lido; o outro repo NUNCA é tocado);
 *  - guarda Forbidden por kind (canReadPayable × canReadReceivable);
 *  - o cálculo de faixa é imune ao UTC-shift (dueDate à meia-noite UTC, as_of por componente).
 */
import { AgingReportService, AGING_BUCKETS, NO_COUNTERPARTY_LABEL } from '../AgingReportService';
import type { AgingBucketId } from '../AgingReportService';
import { ForbiddenError } from '../../../../lib/errors';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

/** Minimal Payable/Receivable-shaped row (only the fields the service reads). */
function line(over: {
  id: string;
  dueDate: string; // YYYY-MM-DD
  amountCents: number;
  counterpartyId: string | null;
  name: string; // supplierName / customerName snapshot
  documentNumber?: string | null;
  status?: string;
}) {
  return {
    id: over.id,
    documentNumber: over.documentNumber ?? `NF-${over.id}`,
    dueDate: new Date(`${over.dueDate}T00:00:00.000Z`), // exactly how createPayable persists it
    amountCents: over.amountCents,
    counterpartyId: over.counterpartyId,
    supplierName: over.name,
    customerName: over.name,
    status: over.status ?? 'OPEN',
  };
}

function fullPolicy(over: Record<string, unknown> = {}) {
  return {
    canManage: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canRead: jest.fn(() => true),
    canClosePeriod: jest.fn(() => true),
    canReconcile: jest.fn(() => true),
    canReadReferential: jest.fn(() => true),
    canManageReferential: jest.fn(() => true),
    canManagePayable: jest.fn(() => true),
    canReadPayable: jest.fn(() => true),
    canManageReceivable: jest.fn(() => true),
    canReadReceivable: jest.fn(() => true),
    canManageDimension: jest.fn(() => true),
    canReadDimension: jest.fn(() => true),
    canManageCounterparty: jest.fn(() => true),
    canReadCounterparty: jest.fn(() => true),
    canManageEntryApproval: jest.fn(() => true),
    canApproveEntry: jest.fn(() => true),
    enforcesSegregationOfDuties: jest.fn(() => false),
    ...over,
  };
}

function buildService(over: { payableRows?: any[]; receivableRows?: any[]; policy?: any } = {}) {
  const payableRepo = { findOutstanding: jest.fn(async () => over.payableRows ?? []) };
  const receivableRepo = { findOutstanding: jest.fn(async () => over.receivableRows ?? []) };
  const policy = over.policy ?? fullPolicy();
  const svc = new AgingReportService(payableRepo as any, receivableRepo as any, policy as any);
  return { svc, payableRepo, receivableRepo, policy };
}

/** A mixed fixture: vencidos + a-vencer, 2 contrapartes + uma linha sem contraparte. as_of = 2026-07-16. */
const MIXED = [
  line({ id: 'p1', dueDate: '2026-08-01', amountCents: 10000, counterpartyId: 'cp-A', name: 'Alfa' }), // a vencer
  line({ id: 'p2', dueDate: '2026-07-01', amountCents: 20000, counterpartyId: 'cp-A', name: 'Alfa' }), // 15d → 1–30
  line({ id: 'p3', dueDate: '2026-06-01', amountCents: 30000, counterpartyId: 'cp-B', name: 'Bravo' }), // 45d → 31–60
  line({ id: 'p4', dueDate: '2026-01-01', amountCents: 40000, counterpartyId: 'cp-B', name: 'Bravo' }), // 196d → >90
  line({ id: 'p5', dueDate: '2026-05-10', amountCents: 5000, counterpartyId: null, name: 'Avulso' }), // 67d → 61–90
];
const AS_OF = '2026-07-16';

describe('AgingReportService.aging — buckets', () => {
  beforeEach(() => jest.clearAllMocks());

  it('classifica cada linha na faixa certa pela as_of', async () => {
    const { svc } = buildService({ payableRows: MIXED });
    const r = await svc.aging(scope, { kind: 'payable', asOf: AS_OF });
    const byId = new Map(r.groups.flatMap((g) => g.documents.map((d) => [d.id, d])));
    expect(byId.get('p1')!.bucket).toBe<AgingBucketId>('a_vencer');
    expect(byId.get('p2')!.bucket).toBe<AgingBucketId>('d1_30');
    expect(byId.get('p3')!.bucket).toBe<AgingBucketId>('d31_60');
    expect(byId.get('p5')!.bucket).toBe<AgingBucketId>('d61_90');
    expect(byId.get('p4')!.bucket).toBe<AgingBucketId>('d90_plus');
    // daysOverdue é o inteiro com sinal as_of − dueDate.
    expect(byId.get('p2')!.daysOverdue).toBe(15);
    expect(byId.get('p1')!.daysOverdue).toBe(-16); // a vencer → negativo
  });

  it('dueDate == as_of ⇒ "a vencer" (fronteira dueDate ≥ as_of); atraso começa em 1 dia', async () => {
    const rows = [
      line({ id: 'due-today', dueDate: AS_OF, amountCents: 100, counterpartyId: 'cp-A', name: 'Alfa' }),
      line({ id: 'due-yesterday', dueDate: '2026-07-15', amountCents: 200, counterpartyId: 'cp-A', name: 'Alfa' }),
    ];
    const { svc } = buildService({ payableRows: rows });
    const r = await svc.aging(scope, { kind: 'payable', asOf: AS_OF });
    const byId = new Map(r.groups.flatMap((g) => g.documents.map((d) => [d.id, d])));
    expect(byId.get('due-today')!.bucket).toBe('a_vencer');
    expect(byId.get('due-today')!.daysOverdue).toBe(0);
    expect(byId.get('due-yesterday')!.bucket).toBe('d1_30');
    expect(byId.get('due-yesterday')!.daysOverdue).toBe(1);
  });
});

describe('AgingReportService.aging — agrupamento + invariante', () => {
  beforeEach(() => jest.clearAllMocks());

  it('agrupa por contraparte; NULL colapsa em "(Sem contraparte)"', async () => {
    const { svc } = buildService({ payableRows: MIXED });
    const r = await svc.aging(scope, { kind: 'payable', asOf: AS_OF });
    const alfa = r.groups.find((g) => g.counterpartyId === 'cp-A')!;
    const bravo = r.groups.find((g) => g.counterpartyId === 'cp-B')!;
    const none = r.groups.find((g) => g.counterpartyId === null)!;
    expect(alfa.counterpartyName).toBe('Alfa');
    expect(alfa.documents.map((d) => d.id).sort()).toEqual(['p1', 'p2']);
    expect(bravo.documents.map((d) => d.id).sort()).toEqual(['p3', 'p4']);
    expect(none.counterpartyName).toBe(NO_COUNTERPARTY_LABEL);
    expect(none.documents.map((d) => d.id)).toEqual(['p5']);
    // 3 grupos: Alfa, Bravo, (Sem contraparte)
    expect(r.groups).toHaveLength(3);
  });

  it('TODAS as linhas sem contraparte caem NUM ÚNICO grupo "(Sem contraparte)"', async () => {
    const rows = [
      line({ id: 'n1', dueDate: '2026-07-01', amountCents: 100, counterpartyId: null, name: 'Fornecedor X' }),
      line({ id: 'n2', dueDate: '2026-06-01', amountCents: 200, counterpartyId: null, name: 'Fornecedor Y' }),
    ];
    const { svc } = buildService({ payableRows: rows });
    const r = await svc.aging(scope, { kind: 'payable', asOf: AS_OF });
    const nullGroups = r.groups.filter((g) => g.counterpartyId === null);
    expect(nullGroups).toHaveLength(1);
    expect(nullGroups[0].documents.map((d) => d.id).sort()).toEqual(['n1', 'n2']);
    expect(nullGroups[0].totalCents).toBe('300');
  });

  it('INVARIANTE: total geral === Σ faixas === Σ grupos (inteiro exato)', async () => {
    const { svc } = buildService({ payableRows: MIXED });
    const r = await svc.aging(scope, { kind: 'payable', asOf: AS_OF });

    const sumBuckets = AGING_BUCKETS.reduce((acc, b) => acc + parseInt(r.buckets[b], 10), 0);
    const sumGroups = r.groups.reduce((acc, g) => acc + parseInt(g.totalCents, 10), 0);
    expect(parseInt(r.totalCents, 10)).toBe(105000);
    expect(sumBuckets).toBe(105000);
    expect(sumGroups).toBe(105000);

    // Cada grupo: total do grupo === Σ das faixas do grupo.
    for (const g of r.groups) {
      const gb = AGING_BUCKETS.reduce((acc, b) => acc + parseInt(g.buckets[b], 10), 0);
      expect(gb).toBe(parseInt(g.totalCents, 10));
    }

    // Faixas do total geral batem com o esperado.
    expect(r.buckets).toEqual({
      a_vencer: '10000',
      d1_30: '20000',
      d31_60: '30000',
      d61_90: '5000',
      d90_plus: '40000',
    });
  });
});

describe('AgingReportService.aging — as_of overridável', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mudar as_of move a mesma linha entre faixas', async () => {
    const rows = [line({ id: 'p2', dueDate: '2026-07-01', amountCents: 20000, counterpartyId: 'cp-A', name: 'Alfa' })];
    const { svc } = buildService({ payableRows: rows });

    // as_of = 2026-06-15 (antes do vencimento) → a vencer.
    const before = await svc.aging(scope, { kind: 'payable', asOf: '2026-06-15' });
    expect(before.groups[0].documents[0].bucket).toBe('a_vencer');

    // as_of = 2026-07-16 (15 dias depois) → 1–30.
    const after = await svc.aging(scope, { kind: 'payable', asOf: '2026-07-16' });
    expect(after.groups[0].documents[0].bucket).toBe('d1_30');

    // as_of = 2026-09-01 (62 dias) → 61–90.
    const later = await svc.aging(scope, { kind: 'payable', asOf: '2026-09-01' });
    expect(later.groups[0].documents[0].bucket).toBe('d61_90');
  });

  it('as_of default = hoje quando omitido; echo no envelope', async () => {
    const { svc } = buildService({ payableRows: [] });
    const r = await svc.aging(scope, { kind: 'payable' });
    expect(r.asOf).toBe(new Date().toISOString().slice(0, 10));
  });
});

describe('AgingReportService.aging — AP × AR + guardas', () => {
  beforeEach(() => jest.clearAllMocks());

  it('kind=payable lê SÓ o repo de payables; envelope carrega kind+unitId', async () => {
    const { svc, payableRepo, receivableRepo } = buildService({ payableRows: MIXED });
    const r = await svc.aging(scope, { kind: 'payable', asOf: AS_OF });
    expect(payableRepo.findOutstanding).toHaveBeenCalledWith(scope);
    expect(receivableRepo.findOutstanding).not.toHaveBeenCalled();
    expect(r.kind).toBe('payable');
    expect(r.unitId).toBe('unit-1');
  });

  it('kind=receivable lê SÓ o repo de receivables e usa customerName como nome-snapshot', async () => {
    const rows = [line({ id: 'r1', dueDate: '2026-06-01', amountCents: 7000, counterpartyId: 'cp-C', name: 'Cliente Z' })];
    const { svc, payableRepo, receivableRepo } = buildService({ receivableRows: rows });
    const r = await svc.aging(scope, { kind: 'receivable', asOf: AS_OF });
    expect(receivableRepo.findOutstanding).toHaveBeenCalledWith(scope);
    expect(payableRepo.findOutstanding).not.toHaveBeenCalled();
    expect(r.kind).toBe('receivable');
    expect(r.groups[0].counterpartyName).toBe('Cliente Z');
    expect(r.groups[0].documents[0].bucket).toBe('d31_60');
  });

  it('Forbidden por kind: canReadPayable=false bloqueia payable', async () => {
    const policy = fullPolicy({ canReadPayable: jest.fn(() => false) });
    const { svc, payableRepo } = buildService({ payableRows: MIXED, policy });
    await expect(svc.aging(scope, { kind: 'payable', asOf: AS_OF })).rejects.toBeInstanceOf(ForbiddenError);
    expect(payableRepo.findOutstanding).not.toHaveBeenCalled();
  });

  it('Forbidden por kind: canReadReceivable=false bloqueia receivable', async () => {
    const policy = fullPolicy({ canReadReceivable: jest.fn(() => false) });
    const { svc, receivableRepo } = buildService({ receivableRows: [], policy });
    await expect(svc.aging(scope, { kind: 'receivable', asOf: AS_OF })).rejects.toBeInstanceOf(ForbiddenError);
    expect(receivableRepo.findOutstanding).not.toHaveBeenCalled();
  });
});
