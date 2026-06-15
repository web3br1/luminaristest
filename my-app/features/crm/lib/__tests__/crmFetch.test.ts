import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dynamic-table service that crmFetch depends on (path as resolved
// from THIS test file → my-app/lib/services/dynamic-table.service).
vi.mock('../../../../lib/services/dynamic-table.service', () => ({
  DynamicTableService: { getTableData: vi.fn() },
}));

import { fetchAllRows } from '../crmFetch';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';

const getTableData = DynamicTableService.getTableData as unknown as ReturnType<typeof vi.fn>;
const page = (rows: number, totalPages: number) => ({
  data: Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, data: {} })),
  totalPages,
});

describe('fetchAllRows', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna todas as linhas de uma única página', async () => {
    getTableData.mockResolvedValueOnce(page(3, 1));
    const rows = await fetchAllRows('t1');
    expect(rows).toHaveLength(3);
    expect(getTableData).toHaveBeenCalledTimes(1);
  });

  it('acumula linhas paginando até totalPages', async () => {
    getTableData
      .mockResolvedValueOnce(page(200, 3))
      .mockResolvedValueOnce(page(200, 3))
      .mockResolvedValueOnce(page(40, 3));
    const rows = await fetchAllRows('t1');
    expect(rows).toHaveLength(440);
    expect(getTableData).toHaveBeenCalledTimes(3);
  });

  it('respeita o guard MAX_PAGES (não itera além de 1000 páginas)', async () => {
    // fresh object per call (evita compartilhar a mesma array entre páginas)
    getTableData.mockImplementation(() => Promise.resolve(page(1, 5000)));
    await fetchAllRows('t1');
    // 1 (primeira) + até 999 subsequentes = no máximo 1000 chamadas
    expect(getTableData.mock.calls.length).toBeLessThanOrEqual(1000);
  });

  it('degrada para [] quando a primeira página falha', async () => {
    getTableData.mockRejectedValueOnce(new Error('boom'));
    const rows = await fetchAllRows('t1');
    expect(rows).toEqual([]);
  });
});
