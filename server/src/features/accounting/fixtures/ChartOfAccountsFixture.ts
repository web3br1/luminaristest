/**
 * ChartOfAccountsFixture — the canonical plano de contas seeded into the `contas`
 * table by the posting engine.
 *
 * "Job-generator / não hardcode no service": the account definitions live HERE as a
 * declarative fixture; PostingService.ensureChartOfAccounts only ENSURES them
 * idempotently (create-if-missing by `code`). Hierarchy is by coded key (no
 * parentId, Contract §2.1) — `acceptsEntries: false` on the roots/branches,
 * `true` only on the leaves that receive ledger lines (`partidas`).
 */
export type AccountNature = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface CanonicalAccount {
  code: string;
  name: string;
  nature: AccountNature;
  acceptsEntries: boolean;
}

export const CANONICAL_ACCOUNTS: ReadonlyArray<CanonicalAccount> = [
  { code: '1', name: 'Ativo', nature: 'Asset', acceptsEntries: false },
  { code: '1.1.1', name: 'Banco', nature: 'Asset', acceptsEntries: true },
  { code: '1.1.2', name: 'A Receber', nature: 'Asset', acceptsEntries: true },
  { code: '1.1.3', name: 'Caixa', nature: 'Asset', acceptsEntries: true },
  // Settlement debit leaf (Incremento D / D1-QMAP): card payments land here (the acquirer owes
  // us until the deposit clears) — gross, NOT net; the acquirer fee is a separate Incremento F.
  { code: '1.1.4', name: 'A Receber Cartão / Adquirente', nature: 'Asset', acceptsEntries: true },
  // Contas a Receber (INCR-AR / ADR-INCR-AR F7): the DEDICATED control account of the AR-formal
  // subledger. The recognition of a customer invoice debits this Asset leaf (D 1.1.5 / C
  // revenueAccount 3.x); the receipt credits it (D conta-por-método / C 1.1.5). Deliberately DISTINCT
  // from `1.1.2 A Receber` (which the salon bridge already uses for POS receivables) so
  // Σ open Receivable rows == saldo(1.1.5) — a subledger↔GL tie-out a shared 1.1.2 would break.
  // Sibling leaf under `1.1` — ACC-018 NOT triggered, zero migration (ensureChartOfAccounts creates
  // -if-missing by code; precedent `2.1.2` do AP). BP maps it automatically (nature-only).
  { code: '1.1.5', name: 'Clientes a Receber', nature: 'Asset', acceptsEntries: true },
  // Liability tower (Incremento D / D1-Q10): a Package Balance settlement debits the prepaid
  // liability (service delivered against an advance), NEVER cash. `2` is the synthetic root.
  { code: '2', name: 'Passivo', nature: 'Liability', acceptsEntries: false },
  { code: '2.1.1', name: 'Pacotes Pré-pagos', nature: 'Liability', acceptsEntries: true },
  // Contas a Pagar (INCR-AP / ADR-INCR-AP D2): the recognition of a supplier obligation credits
  // this Liability leaf (D expenseAccount 4.x / C 2.1.2); the settlement debits it (D 2.1.2 / C
  // conta-por-método). Sibling leaf under `2` Passivo — ACC-018 NOT triggered (nothing renamed or
  // reparented), zero migration (ensureChartOfAccounts creates-if-missing by code; precedent
  // `2.3.1` da APURAÇÃO). BP maps it automatically (nature-only).
  { code: '2.1.2', name: 'Fornecedores a Pagar', nature: 'Liability', acceptsEntries: true },
  // Patrimônio Líquido (BE-INCR-SPED-APURACAO / D4): the closing entry (encerramento do
  // resultado) posts the exercise's net result here. `2.3` is the synthetic PL branch under the
  // `2` Passivo group (COD_NAT is per-account in I050, so a PL leaf under Passivo is conforme);
  // `2.3.1` is the analytic retained-earnings leaf that receives the closing partida.
  { code: '2.3', name: 'Patrimônio Líquido', nature: 'Equity', acceptsEntries: false },
  { code: '2.3.1', name: 'Lucros ou Prejuízos Acumulados', nature: 'Equity', acceptsEntries: true },
  { code: '3', name: 'Receita', nature: 'Revenue', acceptsEntries: false },
  // Revenue split by NATURE (ADR-INCR-REVENUE-SPLIT): the ECF-Presumido Bloco P applies a
  // per-activity presumption (services 32/32 vs resale 8/12), so revenue MUST be booked to
  // distinct leaves. `3.1` keeps its stable code (holds posted history — ACC-018 forbids
  // reparenting it) and becomes the SERVICES leaf; `3.3` is the added resale leaf. Cutover:
  // new sales split from here on; history stays in `3.1` (backfill zero).
  { code: '3.1', name: 'Receita de Serviços', nature: 'Revenue', acceptsEntries: true },
  // Contra-revenue (Incremento D / D2-Q5a): a return debits this Revenue-nature leaf, so
  // net revenue (Σ crédito − débito over Revenue accounts) is REDUCED by returns.
  { code: '3.2', name: 'Devoluções de Vendas', nature: 'Revenue', acceptsEntries: true },
  { code: '3.3', name: 'Receita de Revenda de Mercadorias', nature: 'Revenue', acceptsEntries: true },
  { code: '4', name: 'Despesa', nature: 'Expense', acceptsEntries: false },
  { code: '4.1', name: 'Despesas Operacionais', nature: 'Expense', acceptsEntries: true },
];

/**
 * Canonical retained-earnings leaf (Lucros ou Prejuízos Acumulados). The year-end closing
 * entry (BE-INCR-SPED-APURACAO) posts the net result of the exercise against this account.
 * Resolved by CODE (stable), never by name.
 */
export const RETAINED_EARNINGS_CODE = '2.3.1';

/**
 * Canonical "Fornecedores a Pagar" leaf (INCR-AP). The AP recognition credits this account and
 * the settlement debits it. Resolved by CODE (stable), never by name.
 */
export const FORNECEDORES_A_PAGAR_CODE = '2.1.2';

/**
 * Canonical "Clientes a Receber" leaf (INCR-AR, F7). The AR recognition debits this account and the
 * receipt credits it. DEDICATED to the AR-formal subledger (distinct from `1.1.2` used by the salon)
 * so the subledger ties out to the GL. Resolved by CODE (stable), never by name.
 */
export const CLIENTES_A_RECEBER_CODE = '1.1.5';
