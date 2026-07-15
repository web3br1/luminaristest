import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// These accounting panels compile JSX to bare `React.createElement` (esbuild classic runtime) and do
// not `import React` — expose it globally for the render, like the AccountsReceivablePanel test.
(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { DimensionsPanel } from '../DimensionsPanel';
import {
  dimensionsService,
  type DimensionCatalogEntry,
} from '../../../../lib/services/dimensions.service';

vi.mock('../../../../lib/services/dimensions.service', () => ({
  dimensionsService: {
    listCatalog: vi.fn(),
    createDefinition: vi.fn(),
    archiveDefinition: vi.fn(),
    createValue: vi.fn(),
    archiveValue: vi.fn(),
    balanceByDimension: vi.fn(),
    resultByDimension: vi.fn(),
  },
}));

function def(over: Partial<DimensionCatalogEntry['definition']> = {}) {
  return {
    id: 'd1', userId: 'o1', unitId: 'u1', code: 'COST_CENTER', name: 'Centro de Custo',
    status: 'ACTIVE' as const, createdById: 'o1', createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z', deletedAt: null, ...over,
  };
}
function val(over: Partial<DimensionCatalogEntry['values'][number]> = {}) {
  return {
    id: 'v1', userId: 'o1', unitId: 'u1', definitionId: 'd1', code: 'LOJA_CENTRO', name: 'Loja Centro',
    parentId: null, status: 'ACTIVE' as const, createdById: 'o1', createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-06-01T00:00:00Z', deletedAt: null, ...over,
  };
}

describe('DimensionsPanel (render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('shows the empty state when the catalog is empty', async () => {
    vi.mocked(dimensionsService.listCatalog).mockResolvedValue([]);
    render(<DimensionsPanel unitId="u1" />);
    await waitFor(() => expect(screen.getByText(/Nenhum eixo de dimensão cadastrado/)).toBeInTheDocument());
  });

  it('renders an axis with its value and archive actions', async () => {
    const entry: DimensionCatalogEntry = { definition: def(), values: [val()] };
    vi.mocked(dimensionsService.listCatalog).mockResolvedValue([entry]);
    render(<DimensionsPanel unitId="u1" />);
    await waitFor(() => expect(screen.getByText('Centro de Custo')).toBeInTheDocument());
    expect(screen.getByText('Loja Centro')).toBeInTheDocument();
    // both the axis header and the value row expose an "Arquivar" control
    expect(screen.getAllByText('Arquivar').length).toBeGreaterThanOrEqual(2);
    // "Novo valor" is offered for the active axis
    expect(screen.getByText('Novo valor')).toBeInTheDocument();
  });

  it('marks a value with active children as a rollup (aggregator), not a leaf', async () => {
    const entry: DimensionCatalogEntry = {
      definition: def(),
      values: [val({ id: 'parent', code: 'MKT', name: 'Marketing' }), val({ id: 'child', code: 'SEO', name: 'Busca Orgânica', parentId: 'parent' })],
    };
    vi.mocked(dimensionsService.listCatalog).mockResolvedValue([entry]);
    render(<DimensionsPanel unitId="u1" />);
    await waitFor(() => expect(screen.getByText('Marketing')).toBeInTheDocument());
    expect(screen.getByText('(agregador)')).toBeInTheDocument();
    expect(screen.getByText('Busca Orgânica')).toBeInTheDocument();
  });
});
