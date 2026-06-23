'use client';

import React, { createContext, useContext } from 'react';
import { useLeadActivities } from '../hooks/useLeadActivities';
import { useActorNames, type ActorOption } from '../hooks/useActorNames';
import type { CrmRecord } from '../hooks/useCrmData';
import type { ITableSchema } from '../../dashboard/components/shared/dynamic-tables.client';

interface Lead360ContextValue {
  leadId: string;
  /** All activity rows for this lead (all types). Filter in the consumer. */
  activities: CrmRecord[];
  activitiesTableId: string | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Resolved actor (employee) rows for the `actorId` relation on activities. */
  actors: ActorOption[];
  actorName: (id: unknown) => string;
  /** Activities table schema — lets panels derive capability flags without re-fetching. */
  schema: ITableSchema | null;
}

const Lead360Context = createContext<Lead360ContextValue | null>(null);

/**
 * Provides shared activity + actor data to the Lead360 modal panels. Fetches
 * `leadActivities` once and exposes an `actorName` lookup from a single
 * `useActorNames` call — eliminates the 2× activities + 2× employees fetch that
 * occurred when LeadNotesPanel and LeadTimelinePanel each ran their own hooks.
 */
export function Lead360Provider({ leadId, children }: { leadId: string; children: React.ReactNode }) {
  const { loading, error, activities, activitiesTableId, reload } = useLeadActivities(leadId);
  const { actors, actorName, schema } = useActorNames(activitiesTableId, 'actorId');

  return (
    <Lead360Context.Provider value={{ leadId, activities, activitiesTableId, loading, error, reload, actors, actorName, schema }}>
      {children}
    </Lead360Context.Provider>
  );
}

export function useLead360(): Lead360ContextValue {
  const ctx = useContext(Lead360Context);
  if (!ctx) throw new Error('useLead360 must be used inside Lead360Provider');
  return ctx;
}
