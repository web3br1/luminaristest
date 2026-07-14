import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ChartOfAccountsPanel } from '../ChartOfAccountsPanel';
import { accountingService } from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    getAccounts: vi.fn(),
    createAccount: vi.fn(),
    deleteAccount: vi.fn(),
  },
}));

const accounts = [
  { id: 'a1', code: '1.1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true, isDefault: true },
  { id: 'a2', code: '3.1', name: 'Receita de Serviços', nature: 'Revenue', acceptsEntries: true },
];

// getAccounts is invoked through an `as unknown` cast in the component, so the
// mock is loosely typed here on purpose.
const mockGetAccounts = accountingService.getAccounts as unknown as ReturnType<typeof vi.fn>;

describe('ChartOfAccountsPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('renders the account rows once loaded', async () => {
    mockGetAccounts.mockResolvedValue({ accounts });

    render(<ChartOfAccountsPanel unitId="u1" canManage={false} />);

    await waitFor(() => expect(screen.getByText('Caixa')).toBeInTheDocument());
    expect(screen.getByText('Receita de Serviços')).toBeInTheDocument();
    // No manage rights → no "Nova Conta" affordance.
    expect(screen.queryByRole('button', { name: /Nova Conta/ })).not.toBeInTheDocument();
  });

  it('exposes the "Nova Conta" control for managers', async () => {
    mockGetAccounts.mockResolvedValue({ accounts });

    render(<ChartOfAccountsPanel unitId="u1" canManage />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Nova Conta/ })).toBeInTheDocument());
  });

  it('shows the empty state when there are no accounts', async () => {
    mockGetAccounts.mockResolvedValue({ accounts: [] });

    render(<ChartOfAccountsPanel unitId="u1" canManage={false} />);

    await waitFor(() => expect(screen.getByText(/Nenhuma conta cadastrada/)).toBeInTheDocument());
  });
});
