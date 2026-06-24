import { apiClient } from '../api/api-client';

// Frontend types for the dashboard onboarding/setup endpoints (`/dashboard/*`).
// Local to the frontend (not imported from the backend) per the architecture contract §3.

export interface Preset {
  category: string;
  key: string;
  name: string;
  description: string;
}

export interface PresetSchemaField {
  name: string;
  label?: string;
  type: string;
  required?: boolean;
}

export interface PresetTableSchema {
  fields: PresetSchemaField[];
}

export interface PresetDetails {
  tables: Record<string, { name?: string; schema: PresetTableSchema | null }>;
}

export interface QuickDashboardPayload {
  mode: 'quick';
  suiteKey: string;
}

export interface CustomDashboardPayload {
  mode: 'custom';
  presetKey: string;
  removedTables: string[];
  addedFields: Record<string, unknown>;
}

export type CreateDashboardPayload = QuickDashboardPayload | CustomDashboardPayload;

/** Normalize an unknown API error into an Error with a friendly message. */
function toError(err: unknown, fallback: string): Error {
  const rec = (err && typeof err === 'object' ? (err as Record<string, unknown>) : null);
  const message =
    (rec?.['error'] as string) ||
    (rec?.['message'] as string) ||
    (err instanceof Error ? err.message : '') ||
    fallback;
  return new Error(message);
}

/**
 * Wraps the dashboard setup/onboarding endpoints. Consumed by the interview
 * setup wizard (QuickSetup / TotalControlSetup) — these never touch apiClient directly.
 */
export const SetupService = {
  /** GET /dashboard/presets — list the available dashboard presets. */
  async getPresets(): Promise<Preset[]> {
    const body = (await apiClient.get('/dashboard/presets')) as { data?: Preset[] };
    return body.data ?? [];
  },

  /** GET /dashboard/presets/:key — full table/schema details for one preset. */
  async getPresetDetails(key: string): Promise<PresetDetails> {
    try {
      const body = (await apiClient.get(`/dashboard/presets/${key}`)) as { data: PresetDetails };
      return body.data;
    } catch (err) {
      throw toError(err, 'Não foi possível carregar os detalhes do preset.');
    }
  },

  /** POST /dashboard/create — provision the user's dashboard from a preset (quick or custom). */
  async createDashboard(payload: CreateDashboardPayload): Promise<void> {
    try {
      await apiClient.post('/dashboard/create', payload);
    } catch (err) {
      throw toError(err, 'Falha ao criar o dashboard.');
    }
  },
};

export default SetupService;
