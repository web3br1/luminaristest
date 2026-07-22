import { getCookie } from 'cookies-next';
import { DashboardLayout, DashboardGridItem } from './types/dashboard-grid.types';

const BASE = `${process.env.NEXT_PUBLIC_API_BASE_URL}/dashboard-layout`;

function authHeaders(): Record<string, string> {
  const token = getCookie('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message || `Dashboard layout request failed (status ${res.status})`);
  }
  const body = await res.json();
  return body.data as T;
}

interface LayoutConfigPayload {
  positions: DashboardGridItem[];
  columns: number;
  widgets: string[];
}

export const DashboardLayoutApi = {
  /** Lists all of the current user's layouts (tabs). */
  list(): Promise<DashboardLayout[]> {
    return fetch(BASE, { headers: authHeaders() }).then(r => unwrap<DashboardLayout[]>(r));
  },

  /** Creates a new layout (tab); it becomes the active one. */
  create(name: string, config: LayoutConfigPayload): Promise<DashboardLayout> {
    return fetch(BASE, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, type: 'GRID', config }),
    }).then(r => unwrap<DashboardLayout>(r));
  },

  /** Persists the grid configuration of a specific layout. */
  saveConfig(id: string, config: LayoutConfigPayload): Promise<DashboardLayout> {
    return fetch(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ config }),
    }).then(r => unwrap<DashboardLayout>(r));
  },

  /** Renames a layout (tab). */
  rename(id: string, name: string): Promise<DashboardLayout> {
    return fetch(`${BASE}/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ name }),
    }).then(r => unwrap<DashboardLayout>(r));
  },

  /** Switches the active layout (tab). */
  activate(id: string): Promise<DashboardLayout> {
    return fetch(`${BASE}/${id}/activate`, {
      method: 'POST',
      headers: authHeaders(),
    }).then(r => unwrap<DashboardLayout>(r));
  },

  /** Deletes a layout (tab). */
  async remove(id: string): Promise<void> {
    const res = await fetch(`${BASE}/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || `Failed to delete layout (status ${res.status})`);
    }
  },
};
