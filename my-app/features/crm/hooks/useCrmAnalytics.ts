import { useCallback, useEffect, useState } from 'react';
import { CrmService, type CrmAnalyticsBundle, type CrmDatePreset } from '../../../lib/services/crm.service';

const EMPTY: CrmAnalyticsBundle = {
  cards: [], funnel: [], source: [], status: [], bant: [], proposals: [], activities: [],
};

export function useCrmAnalytics() {
  const [datePreset, setDatePreset] = useState<CrmDatePreset>('thisYear');
  const [data, setData] = useState<CrmAnalyticsBundle>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (preset: CrmDatePreset) => {
    setLoading(true);
    setError(null);
    try {
      const res = await CrmService.getAnalytics(preset);
      setData(res?.data ?? EMPTY);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar analytics do CRM');
      setData(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(datePreset);
  }, [datePreset, reload]);

  return { datePreset, setDatePreset, data, loading, error };
}
