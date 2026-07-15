import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// This panel compiles JSX to bare `React.createElement` (esbuild classic runtime)
// and does not `import React` — expose it globally for the render, like the
// AccountsPayablePanel test.
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { CounterpartiesPanel } from '../CounterpartiesPanel';
import {
  counterpartiesService,
  type Counterparty,
} from '../../../../lib/services/counterparties.service';

vi.mock('../../../../lib/services/counterparties.service', () => ({
  counterpartiesService: {
    listCounterparties: vi.fn(),
    createCounterparty: vi.fn(),
    archiveCounterparty: vi.fn(),
  },
  COUNTERPARTY_TYPES: ['SUPPLIER', 'CUSTOMER'],
}));

const supplier: Counterparty = {
  id: 'cp1', userId: 'o1', unitId: 'u1', type: 'SUPPLIER', name: 'Fornecedor X',
  ref: '12.345.678/0001-90', createdById: 'o1', createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z', deletedAt: null,
};

const archivedCustomer: Counterparty = {
  ...supplier, id: 'cp2', type: 'CUSTOMER', name: 'Cliente Y', ref: null,
  deletedAt: '2026-06-05T00:00:00Z',
};

describe('CounterpartiesPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('shows the empty state when there are no counterparties', async () => {
    vi.mocked(counterpartiesService.listCounterparties).mockResolvedValue([]);

    render(<CounterpartiesPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText(/Nenhuma contraparte cadastrada/)).toBeInTheDocument());
  });

  it('renders an active supplier with an archive action', async () => {
    vi.mocked(counterpartiesService.listCounterparties).mockResolvedValue([supplier]);

    render(<CounterpartiesPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText('Fornecedor X')).toBeInTheDocument());
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Arquivar/ })).toBeInTheDocument();
  });

  it('renders an archived counterparty without an archive action', async () => {
    vi.mocked(counterpartiesService.listCounterparties).mockResolvedValue([archivedCustomer]);

    render(<CounterpartiesPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText('Cliente Y')).toBeInTheDocument());
    expect(screen.getByText('Arquivada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument();
  });
});
