import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

(globalThis as unknown as { React: typeof React }).React = React;
import { render, screen, cleanup } from '@testing-library/react';
import { JournalEntryModal, type AccountOption } from '../JournalEntryModal';
import type { DimensionCatalogEntry } from '../../../../lib/services/dimensions.service';

vi.mock('../../../../lib/services/accounting.service', () => ({
  accountingService: { postEntry: vi.fn() },
}));

const accounts: AccountOption[] = [
  { id: 'a1', code: '1.1.1', name: 'Caixa', acceptsEntries: true },
  { id: 'a2', code: '3.1', name: 'Receita', acceptsEntries: true },
];

function value(over: Partial<DimensionCatalogEntry['values'][number]>) {
  return {
    id: 'x', userId: 'o1', unitId: 'u1', definitionId: 'd1', code: 'C', name: 'N', parentId: null,
    status: 'ACTIVE' as const, createdById: null, createdAt: '', updatedAt: '', deletedAt: null, ...over,
  };
}

const catalog: DimensionCatalogEntry[] = [
  {
    definition: {
      id: 'd1', userId: 'o1', unitId: 'u1', code: 'COST_CENTER', name: 'Centro de Custo',
      status: 'ACTIVE', createdById: null, createdAt: '', updatedAt: '', deletedAt: null,
    },
    values: [
      value({ id: 'parent', code: 'MKT', name: 'Marketing' }),
      value({ id: 'leaf', code: 'SEO', name: 'Busca', parentId: 'parent' }),
    ],
  },
];

describe('JournalEntryModal dimension tagging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('offers only LEAF values (excludes the rollup parent) in the per-line picker', () => {
    render(
      <JournalEntryModal
        isOpen
        onClose={() => {}}
        unitId="u1"
        accounts={accounts}
        dimensionCatalog={catalog}
        onSuccess={() => {}}
      />,
    );
    // The leaf value option is offered (once per default line = 2 lines).
    expect(screen.getAllByRole('option', { name: 'SEO — Busca' }).length).toBe(2);
    // The rollup parent (has an active child) is NOT taggable.
    expect(screen.queryByRole('option', { name: 'MKT — Marketing' })).toBeNull();
  });

  it('renders no dimension picker when the catalog is empty', () => {
    render(
      <JournalEntryModal isOpen onClose={() => {}} unitId="u1" accounts={accounts} onSuccess={() => {}} />,
    );
    expect(screen.queryByText('Dimensões')).toBeNull();
  });
});
