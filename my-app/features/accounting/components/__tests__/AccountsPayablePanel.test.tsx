import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This panel compiles JSX to bare `React.createElement` (esbuild classic runtime)
// and does not `import React` — expose it globally for the render, like the
// JournalEntriesPanel test.
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AccountsPayablePanel } from '../AccountsPayablePanel';
import {
  accountsPayableService,
  type PayableWithPayments,
} from '../../../../lib/services/accountsPayable.service';

vi.mock('../../../../lib/services/accountsPayable.service', () => ({
  accountsPayableService: {
    listPayables: vi.fn(),
    createPayable: vi.fn(),
    registerPayment: vi.fn(),
    cancelPayable: vi.fn(),
    cancelPayment: vi.fn(),
  },
  PAYMENT_METHODS: ['Cash', 'Pix', 'TED', 'Boleto'],
}));

const openPayable: PayableWithPayments = {
  id: 'ap1', userId: 'o1', unitId: 'u1', supplierName: 'Fornecedor X', supplierRef: null,
  documentNumber: 'NF-1', description: 'Aluguel', issueDate: '2026-06-01', dueDate: '2026-06-10',
  amountCents: 150000, expenseAccountId: 'acc1', status: 'OPEN', createdById: 'o1',
  cancelledById: null, cancelReason: null, createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z', deletedAt: null, payments: [],
};

const paidPayable: PayableWithPayments = {
  ...openPayable, id: 'ap2', supplierName: 'Fornecedor Y', documentNumber: 'NF-2',
  description: 'Energia', status: 'PAID',
  payments: [{
    id: 'pay1', userId: 'o1', unitId: 'u1', payableId: 'ap2', amountCents: 150000, method: 'Pix',
    paidAt: '2026-06-05', paidByUserId: 'o1', status: 'ACTIVE', entryId: 'e9',
    createdAt: '2026-06-05T00:00:00Z', updatedAt: '2026-06-05T00:00:00Z',
  }],
};

describe('AccountsPayablePanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('shows the empty state when there are no payables', async () => {
    vi.mocked(accountsPayableService.listPayables).mockResolvedValue({ payables: [], total: 0 });

    render(<AccountsPayablePanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText(/Nenhuma conta a pagar registrada/)).toBeInTheDocument());
  });

  it('renders an OPEN payable with pay + cancel actions and no NaN money', async () => {
    vi.mocked(accountsPayableService.listPayables).mockResolvedValue({ payables: [openPayable], total: 1 });

    const { container } = render(<AccountsPayablePanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText('Fornecedor X')).toBeInTheDocument());
    expect(screen.getByText('Em aberto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Pagar/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancelar/ })).toBeInTheDocument();
    expect(container.textContent).toContain('1.500,00');
    expect(container.textContent).not.toContain('NaN');
  });

  it('renders a PAID payable with an undo-payment action', async () => {
    vi.mocked(accountsPayableService.listPayables).mockResolvedValue({ payables: [paidPayable], total: 1 });

    render(<AccountsPayablePanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText('Fornecedor Y')).toBeInTheDocument());
    expect(screen.getByText('Paga')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desfazer pagamento/ })).toBeInTheDocument();
  });
});
