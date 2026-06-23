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
  { code: '3', name: 'Receita', nature: 'Revenue', acceptsEntries: false },
  { code: '3.1', name: 'Receita de Vendas', nature: 'Revenue', acceptsEntries: true },
  { code: '4', name: 'Despesa', nature: 'Expense', acceptsEntries: false },
  { code: '4.1', name: 'Despesas Operacionais', nature: 'Expense', acceptsEntries: true },
];
