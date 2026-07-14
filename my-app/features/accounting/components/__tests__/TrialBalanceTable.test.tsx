import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';

// The component under test uses jsx:"preserve" + esbuild's classic runtime, so its
// JSX compiles to bare `React.createElement` with React expected in scope. Unlike the
// panels that `import React`, this one doesn't — expose it globally for the render.
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup } from '@testing-library/react';
import { TrialBalanceTable } from '../TrialBalanceTable';
import type { TrialBalanceReport } from '../../../../lib/services/accounting.service';

// TrialBalanceTable is a pure presentational component (props only, no service) —
// its three states (loading / no report / populated) are exercised directly.

const report = (): TrialBalanceReport => ({
  unitId: 'u1',
  rows: [
    { accountId: 'a1', code: '1.1.1', name: 'Caixa', nature: 'Asset', debitCents: 100000, creditCents: 0, balanceCents: 100000 },
    { accountId: 'a2', code: '3.1', name: 'Receita de Vendas', nature: 'Revenue', debitCents: 0, creditCents: 40000, balanceCents: -40000 },
  ],
  totals: { debitCents: 100000, creditCents: 40000, balanceCents: 60000 },
  balanced: false,
});

describe('TrialBalanceTable (render)', () => {
  beforeEach(cleanup);

  it('shows the loading state', () => {
    const { container } = render(<TrialBalanceTable report={null} loading />);
    expect(container.textContent).toContain('Carregando balancete');
  });

  it('prompts to select a unit when there is no report', () => {
    render(<TrialBalanceTable report={null} loading={false} />);
    expect(screen.getByText(/Selecione uma unidade/)).toBeInTheDocument();
  });

  it('shows the empty state when the report has no rows', () => {
    render(<TrialBalanceTable report={{ ...report(), rows: [] }} loading={false} />);
    expect(screen.getByText(/Nenhum lançamento postado/)).toBeInTheDocument();
  });

  it('renders each account row and the totals footer with formatted money', () => {
    const { container } = render(<TrialBalanceTable report={report()} loading={false} />);
    expect(screen.getByText('Caixa')).toBeInTheDocument();
    expect(screen.getByText('Receita de Vendas')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    // Debit total 100000 cents → "1.000,00"; no NaN from the number-cents path.
    expect(container.textContent).toContain('1.000,00');
    expect(container.textContent).not.toContain('NaN');
  });
});
