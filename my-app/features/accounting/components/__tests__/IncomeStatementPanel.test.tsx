import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The component under test uses jsx:"preserve" + esbuild's classic runtime, so its
// JSX compiles to bare `React.createElement` with React expected in scope. Unlike the
// panels that `import React`, this one doesn't — expose it globally for the render.
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { IncomeStatementPanel } from '../IncomeStatementPanel';
import {
  accountingService,
  type IncomeStatementReport,
  type StatementDiagnostics,
} from '../../../../lib/services/accounting.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: { getIncomeStatement: vi.fn() },
}));

const diagnostics: StatementDiagnostics = {
  mappingVersion: 'v1', unmappedAccounts: [], removedAccountsReferenced: [],
  hasUnclosedPriorYearResult: false, priorYearResultCents: 0, warnings: [],
};

const report: IncomeStatementReport = {
  unitId: 'u1', periodSemantics: 'year_to_date', fromDate: '2026-01-01', toDate: '2026-06-30', mappingVersion: 'v1',
  grossRevenue: { accounts: [{ accountId: 'r1', code: '3.1', name: 'Serviços', amountCents: '100000' }], totalCents: '100000' },
  revenueDeductions: { accounts: [], totalCents: '0' },
  expenses: { accounts: [{ accountId: 'x1', code: '4.1', name: 'Salários', amountCents: '-40000' }], totalCents: '-40000' },
  netResult: { amountCents: '60000', isComputed: true, computation: 'sum' },
  reportStatus: 'OK', diagnostics,
};

describe('IncomeStatementPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('shows the empty prompt before a report is generated', () => {
    render(<IncomeStatementPanel unitId="u1" />);
    expect(screen.getByText(/para visualizar a Demonstração do Resultado/)).toBeInTheDocument();
  });

  it('renders the DRE sections and net result after generating', async () => {
    vi.mocked(accountingService.getIncomeStatement).mockResolvedValue(report);

    const { container } = render(<IncomeStatementPanel unitId="u1" />);
    fireEvent.click(screen.getByRole('button', { name: /Gerar DRE/ }));

    await waitFor(() => expect(screen.getByText('Receita Bruta')).toBeInTheDocument());
    expect(screen.getByText(/Despesas/)).toBeInTheDocument();
    expect(screen.getByText(/Resultado Líquido do Exercício/)).toBeInTheDocument();
    // 60000 cents net → "600,00"; string-cents parsed, never "NaN".
    expect(container.textContent).toContain('600,00');
    expect(container.textContent).not.toContain('NaN');
  });
});
