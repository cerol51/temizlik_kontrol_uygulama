import { create } from 'zustand';
import { api, AppUser, fetchStaffUsersApi, Incident } from '../api';

interface IncidentsState {
  allIncidents: Incident[];
  staffUsers: AppUser[];
  assigneeMap: Record<string, string>;
  loading: boolean;
  error: string | null;

  // Actions
  fetchIncidents: (token?: string | null) => Promise<Incident[]>;
  fetchStaffUsers: (token?: string | null) => Promise<AppUser[]>;
  setAssigneeMap: (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  dispatchIncident: (incidentId: string, staffName: string, staffId: string | undefined, token: string) => Promise<void>;
  resolveIncident: (incidentId: string, note: string, photoUrl: string, token: string) => Promise<void>;
  verifyIncident: (incidentId: string, token: string) => Promise<void>;
  updateIncidentInList: (updated: Incident) => void;
}

export const useIncidentsStore = create<IncidentsState>((set, get) => ({
  allIncidents: [],
  staffUsers: [],
  assigneeMap: {},
  loading: false,
  error: null,

  fetchIncidents: async (token?: string | null) => {
    if (!token) return [];
    set({ loading: true, error: null });
    try {
      const data = await api<Incident[]>('/incidents', token);
      const list = data || [];
      set({ allIncidents: list, loading: false });
      return list;
    } catch (err: any) {
      set({ loading: false, error: err?.message || 'Görevler yüklenemedi.' });
      return [];
    }
  },

  fetchStaffUsers: async (token?: string | null) => {
    if (!token) return [];
    try {
      const users = await fetchStaffUsersApi(token);
      set({ staffUsers: users || [] });
      return users || [];
    } catch {
      return [];
    }
  },

  setAssigneeMap: (updater) => {
    set((state) => ({
      assigneeMap: typeof updater === 'function' ? updater(state.assigneeMap) : updater,
    }));
  },

  dispatchIncident: async (incidentId, staffName, staffId, token) => {
    const updated = await api<Incident>(`/incidents/${incidentId}/dispatch`, token, {
      method: 'POST',
      body: JSON.stringify({
        assignedStaffName: staffName,
        assignedStaffId: staffId || undefined,
      }),
    });
    get().updateIncidentInList(updated);
  },

  resolveIncident: async (incidentId, note, photoUrl, token) => {
    const updated = await api<Incident>(`/incidents/${incidentId}/staff-resolve`, token, {
      method: 'POST',
      body: JSON.stringify({
        note: note || 'Görev giderildi ve temizlik tamamlandı.',
        photoUrl: photoUrl || undefined,
      }),
    });
    get().updateIncidentInList(updated);
  },

  verifyIncident: async (incidentId, token) => {
    const updated = await api<Incident>(`/incidents/${incidentId}/verify-close`, token, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    get().updateIncidentInList(updated);
  },

  updateIncidentInList: (updated: Incident) => {
    set((state) => ({
      allIncidents: state.allIncidents.map((inc) => (inc.id === updated.id ? updated : inc)),
    }));
  },
}));
