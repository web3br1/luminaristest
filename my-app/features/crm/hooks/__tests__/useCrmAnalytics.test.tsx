import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock the CRM service that the hook depends on (path as resolved from THIS
// test file → my-app/lib/services/crm.service). Factory returns a FRESH object.
vi.mock('../../../../lib/services/crm.service', () => ({
  CrmService: { getAnalytics: vi.fn() },
}));

import { useCrmAnalytics } from '../useCrmAnalytics';
import { CrmService } from '../../../../lib/services/crm.service';

const getAnalytics = CrmService.getAnalytics as unknown as ReturnType<typeof vi.fn>;

// Helper que produz um bundle FRESCO por chamada (evita compartilhar arrays).
const bundle = (cardValue: number) => ({
  success: true,
  data: {
    cards: [{ name: 'leads', value: cardValue }],
    funnel: [],
    source: [],
    status: [],
    bant: [],
    proposals: [],
    activities: [],
  },
});

const EMPTY = {
  cards: [], funnel: [], source: [], status: [], bant: [], proposals: [], activities: [],
};

describe('useCrmAnalytics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(a) carrega o bundle e seta loading=false', async () => {
    getAnalytics.mockResolvedValueOnce(bundle(42));

    const { result } = renderHook(() => useCrmAnalytics());

    // estado inicial: loading=true, data vazia
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual(EMPTY);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeNull();
    expect(result.current.data.cards).toEqual([{ name: 'leads', value: 42 }]);
    expect(getAnalytics).toHaveBeenCalledTimes(1);
    expect(getAnalytics).toHaveBeenCalledWith('thisYear');
  });

  it('(b) erro → seta error e mantém EMPTY', async () => {
    getAnalytics.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useCrmAnalytics());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('boom');
    expect(result.current.data).toEqual(EMPTY);
  });

  it('(c) trocar datePreset dispara novo fetch', async () => {
    getAnalytics
      .mockResolvedValueOnce(bundle(1))
      .mockResolvedValueOnce(bundle(2));

    const { result } = renderHook(() => useCrmAnalytics());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getAnalytics).toHaveBeenCalledTimes(1);
    expect(getAnalytics).toHaveBeenLastCalledWith('thisYear');

    act(() => result.current.setDatePreset('last30Days'));

    await waitFor(() => expect(getAnalytics).toHaveBeenCalledTimes(2));
    expect(getAnalytics).toHaveBeenLastCalledWith('last30Days');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.datePreset).toBe('last30Days');
    expect(result.current.data.cards).toEqual([{ name: 'leads', value: 2 }]);
  });
});
