import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { JournalEntriesPanel } from '../JournalEntriesPanel';
import {
  accountingService,
  type JournalEntryWithFullPostings,
} from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    listEntries: vi.fn(),
    reverseEntry: vi.fn(),
  },
}));

const entry: JournalEntryWithFullPostings = {
  id: 'e1', userId: 'o1', unitId: 'u1', date: '2026-06-01', description: 'Venda à vista',
  status: 'Posted', sourceType: 'Manual', sourceId: null, reversedById: null,
  fiscalYear: 2026, entryNumber: 1, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z',
  postings: [
    { id: 'p1', userId: 'o1', unitId: 'u1', entryId: 'e1', accountId: 'a1', debitCents: 100000, creditCents: 0, createdAt: '2026-06-01T00:00:00Z', account: { code: '1.1.1', name: 'Caixa' } },
    { id: 'p2', userId: 'o1', unitId: 'u1', entryId: 'e1', accountId: 'a2', debitCents: 0, creditCents: 100000, createdAt: '2026-06-01T00:00:00Z', account: { code: '3.1', name: 'Receita' } },
  ],
};

describe('JournalEntriesPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('shows the empty state when there are no entries', async () => {
    vi.mocked(accountingService.listEntries).mockResolvedValue({ entries: [], total: 0 });

    render(<JournalEntriesPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText(/Nenhum lançamento postado/)).toBeInTheDocument());
  });

  it('renders an entry row with its total and a reverse action', async () => {
    vi.mocked(accountingService.listEntries).mockResolvedValue({ entries: [entry], total: 1 });

    const { container } = render(<JournalEntriesPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByText('Venda à vista')).toBeInTheDocument());
    // Fiscal number 2026/0001, debit total 100000 cents → "1.000,00", Posted badge.
    expect(screen.getByText('2026/0001')).toBeInTheDocument();
    expect(screen.getByText('Postado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Estornar/ })).toBeInTheDocument();
    expect(container.textContent).toContain('1.000,00');
    expect(container.textContent).not.toContain('NaN');
  });
});
