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
  // Liability tower (Incremento D / D1-Q10): a Package Balance settlement debits the prepaid
  // liability (service delivered against an advance), NEVER cash. `2` is the synthetic root.
  { code: '2', name: 'Passivo', nature: 'Liability', acceptsEntries: false },
  { code: '2.1.1', name: 'Pacotes Pré-pagos', nature: 'Liability', acceptsEntries: true },
  { code: '3', name: 'Receita', nature: 'Revenue', acceptsEntries: false },
  { code: '3.1', name: 'Receita de Vendas', nature: 'Revenue', acceptsEntries: true },
  // Contra-revenue (Incremento D / D2-Q5a): a return debits this Revenue-nature leaf, so
  // net revenue (Σ crédito − débito over Revenue accounts) is REDUCED by returns.
  { code: '3.2', name: 'Devoluções de Vendas', nature: 'Revenue', acceptsEntries: true },
  { code: '4', name: 'Despesa', nature: 'Expense', acceptsEntries: false },
  { code: '4.1', name: 'Despesas Operacionais', nature: 'Expense', acceptsEntries: true },
];
