import { describe, it, expect } from 'vitest';
import { buildBatchItems, type MappingDraft } from '../CompliancePanel';
import type { UnmappedReferentialAccount } from '../../../../lib/services/referential.service';

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
