import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { DFCPanel } from '../DFCPanel';
import { PeriodComparisonPanel } from '../PeriodComparisonPanel';
import { accountingService } from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: {
    getCashFlow: vi.fn(),
    getPeriodComparison: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

// ── DFC: money is STRING cents → must parseInt before formatting ─────────────
describe('DFCPanel (string cents)', () => {
  it('formats string-cents money (parseInt path, not "NaN")', async () => {
    vi.mocked(accountingService.getCashFlow).mockResolvedValue({
      unitId: 'u1', method: 'indirect', periodSemantics: 'year_to_date',
      fromDate: '2026-01-01', toDate: '2026-06-30', mappingVersion: 'v1',
      operating: { accounts: [], netResultCents: '100000', adjustmentsCents: '0', totalCents: '100000' },
      investing: { accounts: [], totalCents: '0' },
      financing: { accounts: [], totalCents: '0' },
      openingCashCents: '0', closingCashCents: '100000',
      reconciliation: { sectionsTotalCents: '100000', computedClosingCents: '100000', reconciles: true },
      reportStatus: 'OK', warnings: [],
    });

    const { container } = render(<DFCPanel unitId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar DFC/ }));

    await waitFor(() => expect(container.textContent).toContain('1.000,00'));
    expect(container.textContent).not.toContain('NaN');
  });
});

// ── Period comparison: number cents + null deltaPct → "—" ────────────────────
describe('PeriodComparisonPanel (number cents, null baseline)', () => {
  it('renders numeric money directly and shows "—" when previous is 0', async () => {
    vi.mocked(accountingService.getPeriodComparison).mockResolvedValue({
      unitId: 'u1', asOfCurrent: '2026-06-30', asOfPrevious: '2026-05-31',
      rows: [
        { code: '1.1.1', name: 'Caixa', current: 250000, previous: 200000, deltaAbs: 50000, deltaPct: 25 },
        { code: '3.1', name: 'Receita', current: 100000, previous: 0, deltaAbs: 100000, deltaPct: null },
      ],
    });

    const { container } = render(<PeriodComparisonPanel unitId="u1" />);
    fireEvent.change(screen.getAllByDisplayValue('')[0] ?? document.createElement('input'), { target: { value: '2026-05-31' } });
    // both date inputs need a value to enable the button; set them directly
    const inputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(inputs[0], { target: { value: '2026-06-30' } });
    fireEvent.change(inputs[1], { target: { value: '2026-05-31' } });
    fireEvent.click(screen.getByRole('button', { name: /Gerar comparativo/ }));

    await waitFor(() => expect(container.textContent).toContain('2.500,00'));
    expect(container.textContent).toContain('25.0%');
    expect(container.textContent).toContain('—'); // null deltaPct baseline
    expect(container.textContent).not.toContain('NaN');
  });
});
