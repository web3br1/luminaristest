'use client';

import { useLeadActivities } from './useLeadActivities';
import type { CrmRecord } from './useCrmData';

export interface LeadNotesState {
  loading: boolean;
  error: string | null;
  notes: CrmRecord[];
  activitiesTableId: string | null;
  reload: () => Promise<void>;
}

/**
 * A note is one `leadActivities` row `{ leadId, type: 'note', message, actorId? }`.
 * Thin wrapper over `useLeadActivities` narrowed to `type === 'note'` — kept as a
 * named hook so note consumers read `notes` instead of `activities`.
 */
export function useLeadNotes(leadId: string): LeadNotesState {
  const { loading, error, activities, activitiesTableId, reload } = useLeadActivities(leadId, 'note');
  return { loading, error, notes: activities, activitiesTableId, reload };
}
