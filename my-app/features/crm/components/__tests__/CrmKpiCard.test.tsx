import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// CrmKpiCard é presentational (sem rede / sem services). Importamos
// relativo a ESTE arquivo de teste → ../CrmKpiCard.
import { CrmKpiCard } from '../CrmKpiCard';

describe('CrmKpiCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renderiza label e value (happy path)', () => {
    render(<CrmKpiCard label="Total de Leads" value="1.234" />);
    expect(screen.getByText('Total de Leads')).toBeInTheDocument();
    expect(screen.getByText('1.234')).toBeInTheDocument();
  });

  it('renderiza o hint quando fornecido', () => {
    render(<CrmKpiCard label="Receita" value="R$ 50k" hint="vs. mês anterior" />);
    expect(screen.getByText('vs. mês anterior')).toBeInTheDocument();
  });

  it('não renderiza hint quando ausente (edge: vazio)', () => {
    render(<CrmKpiCard label="Conversão" value="12%" />);
    // só existem dois parágrafos: label e value (nenhum hint extra)
    expect(screen.queryByText('vs. mês anterior')).not.toBeInTheDocument();
  });

  it('aplica a classe de tone positive no value', () => {
    render(<CrmKpiCard label="Crescimento" value="+8%" tone="positive" />);
    const value = screen.getByText('+8%');
    expect(value.className).toContain('text-emerald-600');
  });

  it('aplica a classe de tone negative no value', () => {
    render(<CrmKpiCard label="Churn" value="-3%" tone="negative" />);
    const value = screen.getByText('-3%');
    expect(value.className).toContain('text-rose-600');
  });

  it('usa o tone default quando tone não é informado', () => {
    render(<CrmKpiCard label="Tickets" value="42" />);
    const value = screen.getByText('42');
    expect(value.className).toContain('text-gray-900');
  });

  it('renderiza o icon quando fornecido', () => {
    render(
      <CrmKpiCard label="Negócios" value="7" icon={<svg data-testid="kpi-icon" />} />,
    );
    expect(screen.getByTestId('kpi-icon')).toBeInTheDocument();
  });

  it('não renderiza container de icon quando ausente (edge)', () => {
    render(<CrmKpiCard label="Negócios" value="7" />);
    expect(screen.queryByTestId('kpi-icon')).not.toBeInTheDocument();
  });
});
