import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The component under test uses jsx:"preserve" + esbuild's classic runtime, so its
// JSX compiles to bare `React.createElement` with React expected in scope. Unlike the
// panels that `import React`, this one doesn't — expose it globally for the render.
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { LedgerPanel } from '../LedgerPanel';
import {
  accountingService,
  type Account,
  type AccountLedgerReport,
} from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    getAccounts: vi.fn(),
    getAccountLedger: vi.fn(),
  },
}));

const account: Account = {
  id: 'a1', code: '1.1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true,
};

const ledger: AccountLedgerReport = {
  unitId: 'u1',
  account: { accountId: 'a1', code: '1.1.1', name: 'Caixa', nature: 'Asset' },
  rows: [
    { postingId: 'p1', entryId: 'e1', date: '2026-06-01', description: 'Venda à vista', status: 'Posted', debitCents: 100000, creditCents: 0, runningBalanceCents: 100000 },
  ],
  closingBalanceCents: 100000,
};

describe('LedgerPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('loads the chart of accounts then the selected account ledger', async () => {
    vi.mocked(accountingService.getAccounts).mockResolvedValue({ accounts: [account] });
    vi.mocked(accountingService.getAccountLedger).mockResolvedValue(ledger);

    const { container } = render(<LedgerPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText('Venda à vista')).toBeInTheDocument());
    // 100000 cents → "1.000,00" on both the row and the closing footer; no NaN.
    expect(container.textContent).toContain('1.000,00');
    expect(container.textContent).not.toContain('NaN');
    expect(accountingService.getAccountLedger).toHaveBeenCalledWith({ unitId: 'u1', accountCode: '1.1.1' });
  });

  it('shows the empty state when the account has no postings', async () => {
    vi.mocked(accountingService.getAccounts).mockResolvedValue({ accounts: [account] });
    vi.mocked(accountingService.getAccountLedger).mockResolvedValue({ ...ledger, rows: [], closingBalanceCents: 0 });

    render(<LedgerPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText(/Nenhum lançamento nesta conta/)).toBeInTheDocument());
  });
});
