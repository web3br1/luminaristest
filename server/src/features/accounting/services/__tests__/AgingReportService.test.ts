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

/**
 * Conta de controle default do mock: resolve 2.1.2 (Liability) e 1.1.5 (Asset) com as naturezas REAIS
 * do plano canônico — é o que dá sentido ao teste de normalização de sinal. `accounts: null` simula
 * plano sem a conta de controle.
 */
const CONTROL_ACCOUNTS: Record<string, { id: string; code: string; nature: string }> = {
  '2.1.2': { id: 'acc-ap', code: '2.1.2', nature: 'Liability' },
  '1.1.5': { id: 'acc-ar', code: '1.1.5', nature: 'Asset' },
};

function buildService(
  over: {
    payableRows?: any[];
    receivableRows?: any[];
    policy?: any;
    /** Linhas de balancete devolvidas por balancesAsOf (accountId + balanceCents CRU = débito − crédito). */
    balanceRows?: any[];
    /** Override do findByCode — use `() => null` para simular conta de controle ausente. */
    findByCode?: any;
  } = {},
) {
  const payableRepo = { findOutstanding: jest.fn(async () => over.payableRows ?? []) };
  const receivableRepo = { findOutstanding: jest.fn(async () => over.receivableRows ?? []) };
  const accountRepo = {
    findByCode: over.findByCode ?? jest.fn(async (_s: any, code: string) => CONTROL_ACCOUNTS[code] ?? null),
  };
  const reportService = { balancesAsOf: jest.fn(async () => over.balanceRows ?? []) };
  const policy = over.policy ?? fullPolicy();
  const svc = new AgingReportService(
    payableRepo as any,
    receivableRepo as any,
    accountRepo as any,
    reportService as any,
    policy as any,
  );
  return { svc, payableRepo, receivableRepo, accountRepo, reportService, policy };
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

// ─── Tie-out subledger ↔ razão (F-AG4→b, EMENDA 2026-07-15) ─────────────────────

/**
 * "Hoje" UTC — o tie-out SÓ é emitido quando `asOf == hoje`, então estas suítes usam a data corrente
 * de verdade, nunca uma constante congelada (com data fixa elas passariam hoje e cairiam no ramo
 * `as_of_not_today` amanhã, virando testes que não testam mais nada).
 */
const TODAY = new Date().toISOString().slice(0, 10);

/** Uma linha do balancete como balancesAsOf a devolve: `balanceCents` é o sinal CRU débito − crédito. */
function balanceRow(accountId: string, rawBalanceCents: number) {
  return { accountId, balanceCents: rawBalanceCents };
}

describe('AgingReportService.aging — tie-out fecha', () => {
  beforeEach(() => jest.clearAllMocks());

  it('AP: subrazão == razão ⇒ tiesOut, difference 0, conta de controle 2.1.2', async () => {
    // Aging 600,00; razão: 2.1.2 com saldo CREDOR de 600,00 ⇒ cru = 0 − 60000 = −60000.
    const { svc, accountRepo } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      balanceRows: [balanceRow('acc-ap', -60000)],
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(accountRepo.findByCode).toHaveBeenCalledWith(scope, '2.1.2');
    expect(r.tieOutSkippedReason).toBeNull();
    expect(r.tieOut).toEqual({
      controlAccountCode: '2.1.2',
      subledgerTotalCents: '60000',
      controlAccountBalanceCents: '60000', // normalizado: crédito − débito
      differenceCents: '0',
      tiesOut: true,
    });
  });

  it('AR: subrazão == razão ⇒ tiesOut, difference 0, conta DEDICADA 1.1.5 (não a 1.1.2 do salão)', async () => {
    // Aging 600,00; razão: 1.1.5 com saldo DEVEDOR de 600,00 ⇒ cru = +60000.
    const { svc, accountRepo } = buildService({
      receivableRows: [line({ id: 'r1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-C', name: 'Cliente Z' })],
      balanceRows: [balanceRow('acc-ar', 60000)],
    });
    const r = await svc.aging(scope, { kind: 'receivable', asOf: TODAY });
    expect(accountRepo.findByCode).toHaveBeenCalledWith(scope, '1.1.5');
    // A conta do salão JAMAIS é consultada — é por a 1.1.5 ser dedicada que o tie-out fecha (INCR-AR F7).
    expect(accountRepo.findByCode).not.toHaveBeenCalledWith(scope, '1.1.2');
    expect(r.tieOut).toEqual({
      controlAccountCode: '1.1.5',
      subledgerTotalCents: '60000',
      controlAccountBalanceCents: '60000',
      differenceCents: '0',
      tiesOut: true,
    });
  });

  it('soma o total do aging inteiro (multi-grupo/multi-faixa), não uma linha só', async () => {
    // MIXED soma 105000 (10000+20000+30000+40000+5000); razão credor de 105000 ⇒ fecha.
    const { svc } = buildService({ payableRows: MIXED, balanceRows: [balanceRow('acc-ap', -105000)] });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(r.totalCents).toBe('105000');
    expect(r.tieOut!.subledgerTotalCents).toBe('105000');
    expect(r.tieOut!.tiesOut).toBe(true);
  });
});

describe('AgingReportService.aging — tie-out NÃO fecha (divergência real)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('AP: razão menor que o subrazão ⇒ tiesOut false com a diferença correta', async () => {
    // Aging 60000; razão credor de apenas 50000 (cru −50000) ⇒ falta 10000 no razão.
    const { svc } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      balanceRows: [balanceRow('acc-ap', -50000)],
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(r.tieOut!.controlAccountBalanceCents).toBe('50000');
    expect(r.tieOut!.differenceCents).toBe('10000');
    expect(r.tieOut!.tiesOut).toBe(false);
  });

  it('AR: razão maior que o subrazão ⇒ diferença NEGATIVA (sobra no razão), tiesOut false', async () => {
    const { svc } = buildService({
      receivableRows: [line({ id: 'r1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-C', name: 'Cliente Z' })],
      balanceRows: [balanceRow('acc-ar', 75000)],
    });
    const r = await svc.aging(scope, { kind: 'receivable', asOf: TODAY });
    expect(r.tieOut!.differenceCents).toBe('-15000');
    expect(r.tieOut!.tiesOut).toBe(false);
  });

  it('conta de controle existe mas sem partidas ⇒ saldo 0 (≠ ausente): difference = total, tiesOut false', async () => {
    const { svc } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      balanceRows: [], // conta no plano, nenhuma partida
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(r.tieOutSkippedReason).toBeNull(); // saldo 0 é um NÚMERO, não uma omissão
    expect(r.tieOut!.controlAccountBalanceCents).toBe('0');
    expect(r.tieOut!.differenceCents).toBe('60000');
    expect(r.tieOut!.tiesOut).toBe(false);
  });
});

/**
 * Os testes que falhariam se o saldo fosse comparado no SINAL CRU.
 *
 * O par AP+AR é o que prende a normalização POR NATUREZA — nenhum dos dois sozinho basta:
 *  - o caso AP mata "não normalizar" (comparar o cru): passivo credor vem −60000, a diferença viraria
 *    120000 (2× o saldo) e o tie-out do AP JAMAIS fecharia;
 *  - o caso AR mata a "correção" preguiçosa de negar tudo (`-raw` sem olhar a natureza): o ativo devedor
 *    vem +60000 e a negação cega o transformaria em −60000, com diferença 120000.
 * Só a normalização dependente da natureza (Asset ⇒ débito−crédito, Liability ⇒ crédito−débito) passa
 * nos dois ao mesmo tempo.
 */
describe('AgingReportService.aging — tie-out normaliza o sinal PELA NATUREZA da conta', () => {
  beforeEach(() => jest.clearAllMocks());

  it('AP/passivo: saldo CREDOR (cru negativo) normaliza para magnitude positiva e fecha', async () => {
    const { svc } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      balanceRows: [balanceRow('acc-ap', -60000)], // cru débito−crédito de um passivo credor
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    // Comparação crua daria differenceCents = 60000 − (−60000) = '120000' e tiesOut false.
    expect(r.tieOut!.controlAccountBalanceCents).toBe('60000');
    expect(r.tieOut!.differenceCents).toBe('0');
    expect(r.tieOut!.tiesOut).toBe(true);
  });

  it('AR/ativo: saldo DEVEDOR (cru positivo) NÃO é negado — segue positivo e fecha', async () => {
    const { svc } = buildService({
      receivableRows: [line({ id: 'r1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-C', name: 'Cliente Z' })],
      balanceRows: [balanceRow('acc-ar', 60000)], // cru débito−crédito de um ativo devedor
    });
    const r = await svc.aging(scope, { kind: 'receivable', asOf: TODAY });
    // Uma negação cega ("normalizar" tudo) daria '-60000' e differenceCents '120000'.
    expect(r.tieOut!.controlAccountBalanceCents).toBe('60000');
    expect(r.tieOut!.differenceCents).toBe('0');
    expect(r.tieOut!.tiesOut).toBe(true);
  });

  it('passivo com saldo DEVEDOR (anômalo) normaliza para magnitude NEGATIVA — o sinal segue a natureza, não o valor', async () => {
    // Um 2.1.2 devedor é anomalia contábil real (pagou-se mais do que se devia). O tie-out deve
    // reportá-la como −50000, não escondê-la num Math.abs.
    const { svc } = buildService({
      payableRows: [],
      balanceRows: [balanceRow('acc-ap', 50000)], // cru positivo num PASSIVO
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(r.tieOut!.controlAccountBalanceCents).toBe('-50000');
    expect(r.tieOut!.differenceCents).toBe('50000');
    expect(r.tieOut!.tiesOut).toBe(false);
  });
});

describe('AgingReportService.aging — tie-out OMITIDO (null + motivo, nunca um número que mente)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('as_of PASSADA ⇒ tieOut null + as_of_not_today, e o razão NEM é consultado', async () => {
    const { svc, reportService, accountRepo } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      balanceRows: [balanceRow('acc-ap', -60000)], // fecharia, se fosse hoje
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: '2020-01-31' });
    expect(r.tieOut).toBeNull();
    expect(r.tieOutSkippedReason).toBe('as_of_not_today');
    // O aging em si continua íntegro — só o tie-out é omitido.
    expect(r.totalCents).toBe('60000');
    // Short-circuit: nada de razão nem de plano numa as_of em que a comparação não faz sentido.
    expect(reportService.balancesAsOf).not.toHaveBeenCalled();
    expect(accountRepo.findByCode).not.toHaveBeenCalled();
  });

  it('as_of FUTURA ⇒ também omitido: só HOJE os dois lados falam da mesma data', async () => {
    const { svc } = buildService({ payableRows: MIXED, balanceRows: [balanceRow('acc-ap', -105000)] });
    const r = await svc.aging(scope, { kind: 'payable', asOf: '2099-12-31' });
    expect(r.tieOut).toBeNull();
    expect(r.tieOutSkippedReason).toBe('as_of_not_today');
  });

  it('as_of OMITIDA (default hoje) ⇒ tie-out É emitido — default e teste-de-hoje usam o MESMO utcToday', async () => {
    const { svc } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      balanceRows: [balanceRow('acc-ap', -60000)],
    });
    const r = await svc.aging(scope, { kind: 'payable' }); // sem asOf
    expect(r.asOf).toBe(TODAY);
    expect(r.tieOutSkippedReason).toBeNull();
    expect(r.tieOut!.tiesOut).toBe(true);
  });

  it('conta de controle AUSENTE no plano ⇒ tieOut null + control_account_missing (não um saldo 0 forjado)', async () => {
    const { svc, reportService } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      findByCode: jest.fn(async () => null),
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(r.tieOut).toBeNull();
    expect(r.tieOutSkippedReason).toBe('control_account_missing');
    expect(r.totalCents).toBe('60000'); // aging intacto
    expect(reportService.balancesAsOf).not.toHaveBeenCalled();
  });

  it('conta de controle com natureza fora do BP ⇒ omitido, sem chutar um lado natural', async () => {
    const { svc } = buildService({
      payableRows: [line({ id: 'p1', dueDate: '2026-01-10', amountCents: 60000, counterpartyId: 'cp-A', name: 'Alfa' })],
      findByCode: jest.fn(async () => ({ id: 'acc-ap', code: '2.1.2', nature: 'Revenue' })), // plano corrompido
    });
    const r = await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(r.tieOut).toBeNull();
    expect(r.tieOutSkippedReason).toBe('control_account_not_balance_sheet_nature');
  });

  it('tieOut e tieOutSkippedReason são mutuamente exclusivos (exatamente um é null)', async () => {
    const { svc } = buildService({ payableRows: MIXED, balanceRows: [balanceRow('acc-ap', -105000)] });
    for (const asOf of [TODAY, '2020-01-31']) {
      const r = await svc.aging(scope, { kind: 'payable', asOf });
      expect((r.tieOut === null) !== (r.tieOutSkippedReason === null)).toBe(true);
    }
  });

  it('o saldo do razão é lido no fim-do-dia UTC da as_of (dia inteiro no snapshot)', async () => {
    const { svc, reportService } = buildService({ payableRows: MIXED, balanceRows: [] });
    await svc.aging(scope, { kind: 'payable', asOf: TODAY });
    expect(reportService.balancesAsOf).toHaveBeenCalledWith(scope, new Date(`${TODAY}T23:59:59.999Z`));
  });
});
