import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

import { ImportExportPanel, statusBadge } from '../ImportExportPanel';
import { dataExchangeService } from '../../../../lib/services/dataExchange.service';

vi.mock('../../../../lib/services/dataExchange.service', () => ({
  dataExchangeService: {
    importFile: vi.fn(),
    commit: vi.fn(),
    getRows: vi.fn(),
    downloadTemplate: vi.fn(),
    exportAndDownload: vi.fn(),
  },
}));

const job = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 'job-1',
  direction: 'IMPORT',
  kind: 'IMPORT_JOURNAL_ENTRIES',
  status: 'VALIDATED',
  fileName: 'x.csv',
  mimeType: 'text/csv',
  sizeBytes: 10,
  sha256: 'abc',
  totalRows: 2,
  validRows: 2,
  invalidRows: 0,
  committedRows: 0,
  createdAt: new Date().toISOString(),
  ...overrides,
});

// ── J2 — badge âmbar quando invalidRows > 0 mesmo em COMMITTED ──────────────
describe('statusBadge (FE-INCR6 J2)', () => {
  it('COMMITTED limpo → verde', () => {
    expect(statusBadge('COMMITTED', 0)).toContain('emerald');
  });

  it('COMMITTED com linhas inválidas → âmbar (não verde)', () => {
    const cls = statusBadge('COMMITTED', 2);
    expect(cls).toContain('amber');
    expect(cls).not.toContain('emerald');
  });

  it('VALIDATED com linhas inválidas → âmbar', () => {
    expect(statusBadge('VALIDATED', 1)).toContain('amber');
  });

  it('PARTIAL continua âmbar e FAILED continua vermelho (inalterados)', () => {
    expect(statusBadge('PARTIAL')).toContain('amber');
    expect(statusBadge('FAILED')).toContain('red');
  });

  it('invalidRows não altera PARTIAL/FAILED nem o fallback neutro', () => {
    expect(statusBadge('FAILED', 3)).toContain('red');
    expect(statusBadge('UNKNOWN', 3)).toContain('neutral');
  });
});

// ── W1 — onCommitSuccess dispara quando o commit grava linhas ───────────────
describe('ImportExportPanel — onCommitSuccess (FE-INCR6 W1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    vi.mocked(dataExchangeService.getRows).mockResolvedValue([]);
  });

  async function uploadAndCommit(commitResult: ReturnType<typeof job>, onCommitSuccess: () => void) {
    vi.mocked(dataExchangeService.importFile).mockResolvedValue(job());
    vi.mocked(dataExchangeService.commit).mockResolvedValue(commitResult);

    const { container } = render(<ImportExportPanel unitId="u1" onCommitSuccess={onCommitSuccess} />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['a,b'], 'x.csv', { type: 'text/csv' })] } });

    const confirmBtn = await screen.findByRole('button', { name: /Confirmar importação/ });
    fireEvent.click(confirmBtn);
  }

  it('chama onCommitSuccess quando o commit grava linhas (committedRows > 0)', async () => {
    const spy = vi.fn();
    await uploadAndCommit(job({ status: 'COMMITTED', committedRows: 2 }), spy);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('NÃO chama onCommitSuccess quando nada foi gravado (job FAILED, committedRows = 0)', async () => {
    const spy = vi.fn();
    await uploadAndCommit(job({ status: 'FAILED', committedRows: 0 }), spy);
    await waitFor(() => expect(dataExchangeService.commit).toHaveBeenCalled());
    expect(spy).not.toHaveBeenCalled();
  });
});
