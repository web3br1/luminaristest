import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CompliancePanel, buildBatchItems, type MappingDraft } from '../CompliancePanel';
import type { UnmappedReferentialAccount } from '../../../../lib/services/referential.service';

// Stub the referential service so mounting the panel never touches the network.
// The panel fetches coverage only on an explicit "Carregar cobertura" click, so a
// bare mount stays inert — these stubs just keep the import graph offline.
vi.mock('../../../../lib/services/referential.service', () => ({
  referentialService: {
    getCoverage: vi.fn(),
    batchSet: vi.fn(),
    copyVersion: vi.fn(),
  },
}));

const acc = (accountId: string, name: string): UnmappedReferentialAccount => ({
  accountId,
  code: '1.1.1',
  name,
  nature: 'ASSET',
});

describe('buildBatchItems (A1a referential authoring)', () => {
  const accounts = [acc('a1', 'Caixa'), acc('a2', 'Banco'), acc('a3', 'Clientes')];

  it('sends only rows with a non-blank referential code', () => {
    const drafts: MappingDraft = {
      a1: { referentialCode: '1.01.01', label: 'Caixa RFB' },
      a2: { referentialCode: '', label: 'ignored' }, // blank code → skipped
      // a3 untouched → skipped (upsert omits, never deletes)
    };
    const items = buildBatchItems(drafts, accounts);
    expect(items).toEqual([{ accountId: 'a1', referentialCode: '1.01.01', label: 'Caixa RFB' }]);
  });

  it('falls back to the account name when the label is blank', () => {
    const drafts: MappingDraft = { a2: { referentialCode: '1.01.02', label: '  ' } };
    const items = buildBatchItems(drafts, accounts);
    expect(items).toEqual([{ accountId: 'a2', referentialCode: '1.01.02', label: 'Banco' }]);
  });

  it('trims code and label', () => {
    const drafts: MappingDraft = { a1: { referentialCode: '  1.01.01  ', label: '  Caixa  ' } };
    expect(buildBatchItems(drafts, accounts)).toEqual([
      { accountId: 'a1', referentialCode: '1.01.01', label: 'Caixa' },
    ]);
  });

  it('is empty when nothing was filled', () => {
    expect(buildBatchItems({}, accounts)).toEqual([]);
  });
});

// ── Render smoke: version picker mounts, coverage table stays hidden pre-load ──
describe('CompliancePanel (render)', () => {
  beforeEach(cleanup);

  it('renders the mapping section header and the load control', () => {
    render(<CompliancePanel unitId="u1" />);
    expect(screen.getByRole('heading', { name: /Mapeamento Referencial \(RFB\)/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Carregar cobertura/ })).toBeInTheDocument();
  });

  it('does not render the coverage table or copy-version section before a load', () => {
    render(<CompliancePanel unitId="u1" />);
    // "Copiar versão" only appears once a coverage version is loaded.
    expect(screen.queryByRole('heading', { name: /Copiar versão/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Salvar mapeamentos/ })).not.toBeInTheDocument();
  });
});
