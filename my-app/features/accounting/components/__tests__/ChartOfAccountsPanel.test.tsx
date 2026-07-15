import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { ChartOfAccountsPanel } from '../ChartOfAccountsPanel';
import { accountingService } from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    getAccounts: vi.fn(),
    createAccount: vi.fn(),
    deleteAccount: vi.fn(),
    setAccountRequiresDimension: vi.fn(),
  },
}));

const accounts = [
  { id: 'a1', code: '1.1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true, isDefault: true },
  { id: 'a2', code: '3.1', name: 'Receita de Serviços', nature: 'Revenue', acceptsEntries: true, requiresDimension: false },
  // Synthetic (non-leaf) account: requiresDimension is not applicable.
  { id: 'a3', code: '3', name: 'Receitas', nature: 'Revenue', acceptsEntries: false },
];

// getAccounts is invoked through an `as unknown` cast in the component, so the
// mock is loosely typed here on purpose.
const mockGetAccounts = accountingService.getAccounts as unknown as ReturnType<typeof vi.fn>;
const mockSetRequiresDimension =
  accountingService.setAccountRequiresDimension as unknown as ReturnType<typeof vi.fn>;

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

  it('toggles requiresDimension on a leaf account via the service (managers)', async () => {
    mockGetAccounts.mockResolvedValue({ accounts });
    mockSetRequiresDimension.mockResolvedValue({ account: { ...accounts[1], requiresDimension: true } });

    render(<ChartOfAccountsPanel unitId="u1" canManage />);

    await waitFor(() => expect(screen.getByText('Receita de Serviços')).toBeInTheDocument());

    // Two leaf accounts (a1, a2) accept entries → two toggle checkboxes; the synthetic a3 shows "—".
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);

    fireEvent.click(checkboxes[1]!); // the a2 (non-default leaf) toggle

    await waitFor(() =>
      expect(mockSetRequiresDimension).toHaveBeenCalledWith('a2', 'u1', true),
    );
  });

  it('hides the requiresDimension toggle for non-managers (read-only badge)', async () => {
    mockGetAccounts.mockResolvedValue({ accounts });

    render(<ChartOfAccountsPanel unitId="u1" canManage={false} />);

    await waitFor(() => expect(screen.getByText('Receita de Serviços')).toBeInTheDocument());
    // No interactive toggles when the viewer cannot manage.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});
