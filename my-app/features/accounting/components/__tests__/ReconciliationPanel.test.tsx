import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ReconciliationPanel } from '../ReconciliationPanel';
import { accountingService, type Account } from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    getAccounts: vi.fn(),
    listBankStatements: vi.fn(),
    getPendingReport: vi.fn(),
  },
}));

const bankAccount: Account = {
  id: 'a1', code: '1.1.2', name: 'Banco', nature: 'Asset', acceptsEntries: true,
};

describe('ReconciliationPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    vi.mocked(accountingService.getAccounts).mockResolvedValue({ accounts: [bankAccount] });
    vi.mocked(accountingService.listBankStatements).mockResolvedValue({ statements: [], total: 0 });
    vi.mocked(accountingService.getPendingReport).mockResolvedValue({
      unitId: 'u1', glAccountId: 'a1', unmatchedLines: [], unmatchedPostings: [],
      totals: { lineCount: 0, lineTotalCents: 0, postingCount: 0 },
    });
  });

  it('defaults to the Extratos sub-view with its import form and empty state', async () => {
    render(<ReconciliationPanel unitId="u1" />);

    // Both sub-tabs render; Extratos is active by default.
    expect(screen.getByRole('button', { name: 'Extratos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fila pendente' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Importar extrato/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Nenhum extrato importado/)).toBeInTheDocument());
  });

  it('switches to the Fila pendente sub-view', async () => {
    render(<ReconciliationPanel unitId="u1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Fila pendente' }));

    await waitFor(() =>
      expect(screen.getByText(/Linhas do extrato sem conciliação/)).toBeInTheDocument(),
    );
  });
});
