import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { PeriodsPanel } from '../PeriodsPanel';
import { accountingService, type AccountingPeriod } from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    listPeriods: vi.fn(),
    seedYear: vi.fn(),
    openPeriod: vi.fn(),
    softClosePeriod: vi.fn(),
    hardClosePeriod: vi.fn(),
    reopenPeriod: vi.fn(),
  },
}));

const period = (month: number, status: AccountingPeriod['status']): AccountingPeriod => ({
  id: `p${month}`, userId: 'o1', unitId: 'u1', year: 2026, month, status,
  openedAt: null, closedAt: null, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
});

describe('PeriodsPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('offers to seed the year when no periods exist', async () => {
    vi.mocked(accountingService.listPeriods).mockResolvedValue([]);

    render(<PeriodsPanel unitId="u1" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Semear/ })).toBeInTheDocument());
    expect(screen.getByText(/Nenhum período criado/)).toBeInTheDocument();
  });

  it('renders the twelve-month grid with a status chip for a loaded period', async () => {
    vi.mocked(accountingService.listPeriods).mockResolvedValue([period(1, 'OPEN')]);

    render(<PeriodsPanel unitId="u1" />);

    // Jan is OPEN → "Aberto" chip + its "Fechar parcial" action; other months stay FUTURE.
    await waitFor(() => expect(screen.getByText('Aberto')).toBeInTheDocument());
    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Dez')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Fechar parcial/ })).toBeInTheDocument();
  });
});
