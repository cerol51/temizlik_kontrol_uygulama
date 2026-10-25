import { create } from 'zustand';
import {
  api,
  createLocation as createLocationApi,
  DashboardData,
  deleteLocation as deleteLocationApi,
  Location,
  PublicLocationStatus,
  regenerateLocationToken,
  SupervisorLocationStatus,
} from '../api';

interface LocationsState {
  locations: Location[];
  selectedId: string;
  status: PublicLocationStatus | null;
  supervisorStatus: SupervisorLocationStatus | null;
  dashboard: DashboardData | null;
  loading: boolean;
  error: string | null;

  // Actions
  fetchLocations: () => Promise<Location[]>;
  setSelectedId: (id: string) => void;
  selectLocation: (id: string, token?: string | null) => Promise<void>;
  refreshSelectedLocation: (token?: string | null) => Promise<void>;
  refreshDashboard: (token?: string | null) => Promise<DashboardData | null>;
  createLocation: (
    data: {
      code: string;
      name: string;
      building: string;
      toleranceMinutes: number;
      schedule: string[];
      currentSupervisorId?: string;
      currentSupervisorName?: string;
      backupSupervisorId?: string;
      backupSupervisorName?: string;
    },
    token: string,
  ) => Promise<Location>;
  deleteLocation: (id: string, token: string) => Promise<void>;
  regenerateToken: (id: string, token: string) => Promise<Location>;
  setStatus: (status: PublicLocationStatus | null) => void;
  setSupervisorStatus: (status: SupervisorLocationStatus | null) => void;
}

export const useLocationsStore = create<LocationsState>((set, get) => ({
  locations: [],
  selectedId: '',
  status: null,
  supervisorStatus: null,
  dashboard: null,
  loading: false,
  error: null,

  fetchLocations: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api<Location[]>('/locations');
      const list = data || [];
      const currentSelected = get().selectedId;
      const nextSelected = currentSelected && list.some((l) => l.id === currentSelected)
        ? currentSelected
        : list[0]?.id || '';

      set({ locations: list, selectedId: nextSelected, loading: false });
      if (nextSelected) {
        void get().selectLocation(nextSelected);
      }
      return list;
    } catch (err: any) {
      set({ loading: false, error: err?.message || 'Mahaller yüklenemedi.' });
      return [];
    }
  },

  setSelectedId: (id: string) => {
    set({ selectedId: id });
    void get().selectLocation(id);
  },

  selectLocation: async (id: string, token?: string | null) => {
    if (!id) return;
    set({ selectedId: id });
    try {
      const [pubStatus, supStatus] = await Promise.all([
        api<PublicLocationStatus>(`/locations/${id}/public`).catch(() => null),
        token ? api<SupervisorLocationStatus>(`/locations/${id}/supervisor`, token).catch(() => null) : null,
      ]);

      set((state) => {
        // Only update if selectedId is still the one we requested
        if (state.selectedId !== id) return state;
        return {
          status: pubStatus,
          supervisorStatus: supStatus || state.supervisorStatus,
        };
      });
    } catch {
      // non-blocking
    }
  },

  refreshSelectedLocation: async (token?: string | null) => {
    const currentId = get().selectedId;
    if (currentId) {
      await get().selectLocation(currentId, token);
    }
  },

  refreshDashboard: async (token?: string | null) => {
    if (!token) return null;
    try {
      const data = await api<DashboardData>('/locations/dashboard/stats', token);
      set({ dashboard: data });
      return data;
    } catch {
      return null;
    }
  },

  createLocation: async (data, token) => {
    const newLoc = await createLocationApi(data, token);
    await get().fetchLocations();
    return newLoc;
  },

  deleteLocation: async (id, token) => {
    await deleteLocationApi(id, token);
    await get().fetchLocations();
  },

  regenerateToken: async (id, token) => {
    const res = await regenerateLocationToken(id, token);
    await get().fetchLocations();
    return res.location;
  },

  setStatus: (status) => set({ status }),
  setSupervisorStatus: (supervisorStatus) => set({ supervisorStatus }),
}));
