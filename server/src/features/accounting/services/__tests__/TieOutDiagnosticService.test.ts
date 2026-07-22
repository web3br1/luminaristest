/**
 * TieOutDiagnosticService — diagnóstico de amarração subrazão ↔ razão (FIX-TIEOUT, Council 1.3),
 * read-only, FIRST-CLASS PRISMA.
 *
 * What is mocked: os repositórios (account/posting/receivable/payable) e a policy — os
 * colaboradores injetados. Nenhum prisma client é necessário: o service nunca abre transação.
 *
 * These tests pin:
 *  - fixture CROSS-NATURE balanceada (Asset 1.1.5/1.1.2 + Liability 2.1.2 no MESMO fixture,
 *    lição bp-dre-diagnostics-test-must-mix-natures): as três verificações fecham, status OK;
 *  - caso DIVERGENTE em cada verificação (subrazão ≠ razão) provando que o diagnóstico ACUSA
 *    (balanced=false, differenceCents com o sinal certo, status DIVERGENT);
 *  - 1.1.2: o lado "subrazão" é o AGREGADO salão+CRM (total − residual-sem-feeders) — salão
 *    sozinho NÃO fecha; partida estranha (lançamento manual em 1.1.2) vira exatamente o residual;
 *  - a 2ª chamada de groupByAccount recebe excludeSourceTypes com TODOS os 5 feeders PDV
 *    (crm.opportunity.won + salon.*) — teria falhado se a exclusão não fosse passada;
 *  - sinal por natureza: 2.1.2 fecha pelo saldo CREDOR (crédito − débito), 1.1.5/1.1.2 pelo DEVEDOR;
 *  - LEDGER_STATUSES (nunca só 'Posted') é o filtro de status das duas agregações;
 *  - empty safety: escopo sem partidas e sem subrazão → três checks 0===0, status OK, sem NaN;
 *  - conta-controle ausente do chart + subrazão com valor → ACUSA (não explode NotFoundError);
 *  - policy canRead nega → ForbiddenError.
 */
import {
  TieOutDiagnosticService,
  POS_FEEDER_SOURCE_TYPES,
  POS_RECEIVABLE_CODE,
} from '../TieOutDiagnosticService';
import type { TieOutCheck } from '../TieOutDiagnosticService';
import { ForbiddenError } from '../../../../lib/errors';
import { LEDGER_STATUSES } from '../../models/ledgerStatus';
import {
  CLIENTES_A_RECEBER_CODE,
  FORNECEDORES_A_PAGAR_CODE,
} from '../../fixtures/ChartOfAccountsFixture';
import type { AccountingScope } from '../../scope/AccountingScope';

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

// Ids fixos das contas-controle no chart mockado.
const AR_ID = 'acc-115';
const AP_ID = 'acc-212';
const POS_ID = 'acc-112';

const CHART: Record<string, { id: string; code: string; name: string; nature: string }> = {
  [CLIENTES_A_RECEBER_CODE]: { id: AR_ID, code: '1.1.5', name: 'Clientes a Receber', nature: 'Asset' },
  [FORNECEDORES_A_PAGAR_CODE]: { id: AP_ID, code: '2.1.2', name: 'Fornecedores a Pagar', nature: 'Liability' },
  [POS_RECEIVABLE_CODE]: { id: POS_ID, code: '1.1.2', name: 'A Receber', nature: 'Asset' },
};

interface Totals {
  accountId: string;
  debitCents: number;
  creditCents: number;
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
 * buildService(overrides) — factory padrão dos testes de service.
 * `totals` = agregado COMPLETO; `totalsSansFeeders` = agregado com excludeSourceTypes
 * (a 2ª chamada). O mock de groupByAccount roteia pela presença de options.excludeSourceTypes.
 */
function buildService(
  over: {
    totals?: Totals[];
    totalsSansFeeders?: Totals[];
    receivableRows?: Array<{ amountCents: number }>;
    payableRows?: Array<{ amountCents: number }>;
    chart?: typeof CHART;
    policy?: ReturnType<typeof fullPolicy>;
  } = {},
) {
  const chart = over.chart ?? CHART;
  const accountRepo = {
    findByCode: jest.fn(async (_s: AccountingScope, code: string) => chart[code] ?? null),
  };
  const postingRepo = {
    groupByAccount: jest.fn(
      async (_s: AccountingScope, _statuses: string[], options?: { excludeSourceTypes?: string[] }) =>
        options?.excludeSourceTypes ? (over.totalsSansFeeders ?? []) : (over.totals ?? []),
    ),
  };
  const receivableRepo = { findOutstanding: jest.fn(async () => over.receivableRows ?? []) };
  const payableRepo = { findOutstanding: jest.fn(async () => over.payableRows ?? []) };
  const policy = over.policy ?? fullPolicy();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const svc = new TieOutDiagnosticService(
    accountRepo as any,
    postingRepo as any,
    receivableRepo as any,
    payableRepo as any,
    policy as any,
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { svc, accountRepo, postingRepo, receivableRepo, payableRepo, policy };
}

function checkById(checks: TieOutCheck[], id: TieOutCheck['id']): TieOutCheck {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`check '${id}' ausente do relatório`);
  return found;
}

/**
 * Fixture CROSS-NATURE balanceada (Asset + Liability juntas — lição
 * bp-dre-diagnostics-test-must-mix-natures):
 *  - AR: 2 receivables em aberto (5000+2000=7000) ↔ 1.1.5 D 9000 / C 2000 → saldo devedor 7000;
 *  - AP: 1 payable em aberto (3000) ↔ 2.1.2 D 1000 / C 4000 → saldo CREDOR 3000;
 *  - 1.1.2: total D 8000 / C 2000 → 6000; sem-feeders D 0 / C 0 → residual 0 (tudo é salão+CRM).
 */
const BALANCED = {
  totals: [
    { accountId: AR_ID, debitCents: 9000, creditCents: 2000 },
    { accountId: AP_ID, debitCents: 1000, creditCents: 4000 },
    { accountId: POS_ID, debitCents: 8000, creditCents: 2000 },
  ],
  totalsSansFeeders: [] as Totals[],
  receivableRows: [{ amountCents: 5000 }, { amountCents: 2000 }],
  payableRows: [{ amountCents: 3000 }],
};

describe('TieOutDiagnosticService.tieOut — fixture cross-nature balanceada', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fecha as três verificações (inteiro exato) e reporta status OK', async () => {
    const { svc } = buildService(BALANCED);
    const r = await svc.tieOut(scope);

    expect(r.unitId).toBe('unit-1');
    expect(r.status).toBe('OK');
    expect(r.checks).toHaveLength(3);

    const ar = checkById(r.checks, 'receivables');
    expect(ar.subledgerCents).toBe('7000');
    expect(ar.ledgerCents).toBe('7000');
    expect(ar.differenceCents).toBe('0');
    expect(ar.balanced).toBe(true);
    expect(ar.controlAccountCode).toBe('1.1.5');
    expect(ar.controlAccountName).toBe('Clientes a Receber');

    // Liability: fecha pelo saldo CREDOR (crédito − débito) — não pelo devedor.
    const ap = checkById(r.checks, 'payables');
    expect(ap.subledgerCents).toBe('3000');
    expect(ap.ledgerCents).toBe('3000');
    expect(ap.balanced).toBe(true);
    expect(ap.controlAccountCode).toBe('2.1.2');

    const pos = checkById(r.checks, 'pos_receivable');
    expect(pos.subledgerCents).toBe('6000'); // total 6000 − residual 0 = agregado salão+CRM
    expect(pos.ledgerCents).toBe('6000');
    expect(pos.balanced).toBe(true);
    expect(pos.controlAccountCode).toBe('1.1.2');
  });

  it('passa LEDGER_STATUSES às duas agregações e excludeSourceTypes com TODOS os 5 feeders PDV na 2ª', async () => {
    const { svc, postingRepo } = buildService(BALANCED);
    await svc.tieOut(scope);

    expect(postingRepo.groupByAccount).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = postingRepo.groupByAccount.mock.calls as Array<
      [AccountingScope, string[], { excludeSourceTypes?: string[] } | undefined]
    >;
    // Ambas com o filtro de escrituração completo (Posted+Reconciled+Reversed, nunca só Posted).
    expect(firstCall[1]).toEqual(LEDGER_STATUSES);
    expect(secondCall[1]).toEqual(LEDGER_STATUSES);
    // 1ª = agregado completo (sem exclusão); 2ª = sem os feeders PDV.
    expect(firstCall[2]?.excludeSourceTypes).toBeUndefined();
    const excluded = secondCall[2]?.excludeSourceTypes ?? [];
    expect([...excluded].sort()).toEqual(
      [
        'crm.opportunity.won',
        'salon.package.sold',
        'salon.sale.finalized',
        'salon.sale.returned',
        'salon.sale.settled',
      ].sort(),
    );
    // E a lista exportada é a mesma (fonte única).
    expect([...POS_FEEDER_SOURCE_TYPES].sort()).toEqual([...excluded].sort());
  });
});

describe('TieOutDiagnosticService.tieOut — casos divergentes (o diagnóstico ACUSA)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('AR: subrazão 7000 vs razão 6000 → balanced=false, differenceCents=-1000, status DIVERGENT', async () => {
    const { svc } = buildService({
      ...BALANCED,
      totals: [
        { accountId: AR_ID, debitCents: 8000, creditCents: 2000 }, // 6000 ≠ 7000 do subrazão
        { accountId: AP_ID, debitCents: 1000, creditCents: 4000 },
        { accountId: POS_ID, debitCents: 8000, creditCents: 2000 },
      ],
    });
    const r = await svc.tieOut(scope);
    const ar = checkById(r.checks, 'receivables');
    expect(ar.balanced).toBe(false);
    expect(ar.differenceCents).toBe('-1000'); // razão − subrazão (razão está MENOR)
    expect(r.status).toBe('DIVERGENT');
    // As outras duas continuam fechadas — a divergência é localizada, não contamina.
    expect(checkById(r.checks, 'payables').balanced).toBe(true);
    expect(checkById(r.checks, 'pos_receivable').balanced).toBe(true);
  });

  it('AP: razão credor 3500 vs subrazão 3000 → differenceCents=+500 (sinal pela natureza Liability)', async () => {
    const { svc } = buildService({
      ...BALANCED,
      totals: [
        { accountId: AR_ID, debitCents: 9000, creditCents: 2000 },
        { accountId: AP_ID, debitCents: 1000, creditCents: 4500 }, // credor 3500 ≠ 3000
        { accountId: POS_ID, debitCents: 8000, creditCents: 2000 },
      ],
    });
    const r = await svc.tieOut(scope);
    const ap = checkById(r.checks, 'payables');
    expect(ap.ledgerCents).toBe('3500');
    expect(ap.differenceCents).toBe('500');
    expect(ap.balanced).toBe(false);
    expect(r.status).toBe('DIVERGENT');
  });

  it('1.1.2: lançamento manual (fora dos feeders) vira residual → agregado salão+CRM ≠ razão, ACUSA', async () => {
    const { svc } = buildService({
      ...BALANCED,
      totals: [
        { accountId: AR_ID, debitCents: 9000, creditCents: 2000 },
        { accountId: AP_ID, debitCents: 1000, creditCents: 4000 },
        { accountId: POS_ID, debitCents: 9500, creditCents: 2000 }, // 7500 no razão
      ],
      // Excluindo os feeders sobra o lançamento manual: D 1500 → residual 1500.
      totalsSansFeeders: [{ accountId: POS_ID, debitCents: 1500, creditCents: 0 }],
    });
    const r = await svc.tieOut(scope);
    const pos = checkById(r.checks, 'pos_receivable');
    expect(pos.ledgerCents).toBe('7500');
    expect(pos.subledgerCents).toBe('6000'); // 7500 − 1500: agregado salão+CRM, NÃO o total
    expect(pos.differenceCents).toBe('1500'); // exatamente a partida estranha
    expect(pos.balanced).toBe(false);
    expect(r.status).toBe('DIVERGENT');
  });

  it('conta-controle 1.1.5 ausente do chart + AR em aberto → razão 0, ACUSA sem explodir', async () => {
    const chartSem115 = { ...CHART };
    delete chartSem115[CLIENTES_A_RECEBER_CODE];
    const { svc } = buildService({ ...BALANCED, chart: chartSem115 });
    const r = await svc.tieOut(scope);
    const ar = checkById(r.checks, 'receivables');
    expect(ar.controlAccountName).toBeNull();
    expect(ar.ledgerCents).toBe('0');
    expect(ar.subledgerCents).toBe('7000');
    expect(ar.balanced).toBe(false);
    expect(r.status).toBe('DIVERGENT');
  });
});

describe('TieOutDiagnosticService.tieOut — empty safety e guarda de policy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('escopo vazio (sem partidas, sem subrazão): três checks 0===0, status OK, sem NaN', async () => {
    const { svc } = buildService();
    const r = await svc.tieOut(scope);
    expect(r.status).toBe('OK');
    for (const c of r.checks) {
      expect(c.subledgerCents).toBe('0');
      expect(c.ledgerCents).toBe('0');
      expect(c.differenceCents).toBe('0');
      expect(c.balanced).toBe(true);
    }
  });

  it('policy canRead nega → ForbiddenError e NENHUM repositório é tocado', async () => {
    const policy = fullPolicy({ canRead: jest.fn(() => false) });
    const { svc, postingRepo, receivableRepo, payableRepo, accountRepo } = buildService({
      ...BALANCED,
      policy,
    });
    await expect(svc.tieOut(scope)).rejects.toThrow(ForbiddenError);
    expect(postingRepo.groupByAccount).not.toHaveBeenCalled();
    expect(receivableRepo.findOutstanding).not.toHaveBeenCalled();
    expect(payableRepo.findOutstanding).not.toHaveBeenCalled();
    expect(accountRepo.findByCode).not.toHaveBeenCalled();
  });
});
