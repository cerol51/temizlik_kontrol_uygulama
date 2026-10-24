import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import {
  AppUser,
  AuthResponse,
  Incident,
  Location,
  PublicLocationStatus,
  SupervisorLocationStatus,
} from './types';

function getDefaultApiUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    // In web browser (iPhone Safari, desktop Chrome, tunnel), use relative /api
    // which proxies through Metro directly to the NestJS backend on port 3000!
    return '/api';
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://192.168.1.106:3000/api';
}

const STORAGE_API_KEY = 'wc_mobile_api_url';
let currentApiBaseUrl = getDefaultApiUrl();

// Initialize from storage
AsyncStorage.getItem(STORAGE_API_KEY).then((saved) => {
  if (saved) {
    // In web, always prefer /api proxy to avoid CORS/mixed-content issues
    if (typeof window !== 'undefined') {
      currentApiBaseUrl = '/api';
    } else {
      currentApiBaseUrl = saved;
    }
  }
});

export function getApiBaseUrl(): string {
  return currentApiBaseUrl;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const trimmed = url.replace(/\/+$/, '');
  currentApiBaseUrl = trimmed;
  await AsyncStorage.setItem(STORAGE_API_KEY, trimmed);
}

export function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title ? title + ': ' : ''}${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'Tamam', onPress: onOk }] : undefined);
  }
}

export async function apiRequest<T>(
  endpoint: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let base = currentApiBaseUrl.replace(/\/+$/, '');
  if (!base.endsWith('/api') && !cleanEndpoint.startsWith('/api') && base !== '') {
    base = `${base}/api`;
  }
  const url = `${base}${cleanEndpoint}`;

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const message =
        typeof body?.message === 'string'
          ? body.message
          : Array.isArray(body?.message)
            ? body.message.join(', ')
            : `İstek başarısız (${response.status}).`;
      throw new Error(message);
    }

    if (response.status === 204) return undefined as unknown as T;
    return response.json() as Promise<T>;
  } catch (err: any) {
    if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Network')) {
      throw new Error(`API sunucusuna bağlanılamadı (${url}). Lütfen bağlantınızı kontrol ediniz.`);
    }
    throw err;
  }
}

export async function loginApi(username: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchLocationsApi(): Promise<Location[]> {
  return apiRequest<Location[]>('/locations');
}

export async function fetchPublicStatusApi(tokenOrId: string): Promise<PublicLocationStatus> {
  return apiRequest<PublicLocationStatus>(`/public/restroom/${tokenOrId}`);
}

export async function submitSurveyApi(data: {
  locationId: string;
  rating: 'good' | 'fair' | 'bad';
  issues?: string[];
  note?: string;
}): Promise<{ success: boolean; message: string; incidentId?: string }> {
  return apiRequest<{ success: boolean; message: string; incidentId?: string }>(
    '/surveys',
    undefined,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );
}

export async function fetchSupervisorStatusApi(
  locationId: string,
  token: string,
): Promise<SupervisorLocationStatus> {
  return apiRequest<SupervisorLocationStatus>(`/supervisor/restroom/${locationId}`, token);
}

export async function fetchAllIncidentsApi(token: string): Promise<Incident[]> {
  const dashboard = await apiRequest<{ allIncidents: Incident[] }>('/reports/dashboard', token);
  return dashboard.allIncidents || [];
}

// 4. Şef Olay Görevlendirme (Dispatch) -> POST /incidents/:id/dispatch
export async function assignIncidentApi(
  incidentId: string,
  staffName: string,
  token: string,
): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${incidentId}/dispatch`, token, {
    method: 'POST',
    body: JSON.stringify({
      assignedStaffName: staffName,
      assignedStaffId: 'staff-assigned',
    }),
  });
}

// 5. Personel Müdahale Çözme -> POST /incidents/:id/staff-resolve
export async function resolveIncidentApi(
  incidentId: string,
  resolutionNote?: string,
  photoUrl?: string,
  token?: string,
): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${incidentId}/staff-resolve`, token, {
    method: 'POST',
    body: JSON.stringify({
      note: resolutionNote || 'Görev personel tarafından sahada tamamlandı.',
      photoUrl,
    }),
  });
}

// 1. Personel Temizlik Kaydı -> POST /locations/:id/cleanings
export async function createCleaningApi(
  data: {
    locationId: string;
    staffName: string;
    items?: string[];
    note?: string;
  },
  token: string,
): Promise<any> {
  return apiRequest(`/locations/${data.locationId}/cleanings`, token, {
    method: 'POST',
    body: JSON.stringify({
      tasksConfirmed: true,
      note: data.note || 'Rutin temizlik tamamlandı.',
    }),
  });
}

// 2. Şef Sürümlü Denetim (Checklist v1.2) -> POST /locations/:id/audits
export async function createAuditApi(
  data: {
    locationId: string;
    isApproved: boolean;
    checklist: Array<{ id: number; label: string; isOk: boolean }>;
    note?: string;
  },
  token: string,
): Promise<any> {
  return apiRequest(`/locations/${data.locationId}/audits`, token, {
    method: 'POST',
    body: JSON.stringify({
      isApproved: data.isApproved,
      checklist: data.checklist,
      note: data.note?.trim() || (data.isApproved ? 'Eksiksiz onaylandı.' : 'Uygunsuzluk tespit edildi.'),
      templateVersion: 'v1.2',
    }),
  });
}

export async function fetchStaffUsersApi(token: string): Promise<AppUser[]> {
  const users = await apiRequest<AppUser[]>('/auth/users', token);
  return users.filter((u) => u.role === 'employee');
}

export function formatTime(value?: string | null): string {
  if (!value) return 'Kayıt yok';
  try {
    const d = new Date(value);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch {
    return value;
  }
}
