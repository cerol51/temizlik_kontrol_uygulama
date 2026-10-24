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

// Dynamic default API URL based on host/platform
function getDefaultApiUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.hostname) {
    const host = window.location.hostname;
    // When opened from phone via 192.168.1.106, use that host for backend API port 3000!
    return `http://${host}:3000/api`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }
  // iOS Expo Go or device default LAN IP
  return 'http://192.168.1.106:3000/api';
}

const STORAGE_API_KEY = 'wc_mobile_api_url';
let currentApiBaseUrl = getDefaultApiUrl();

// Initialize from storage with sensible remote host override
AsyncStorage.getItem(STORAGE_API_KEY).then((saved) => {
  if (saved) {
    if (
      typeof window !== 'undefined' &&
      window.location?.hostname &&
      window.location.hostname !== 'localhost' &&
      saved.includes('localhost')
    ) {
      currentApiBaseUrl = getDefaultApiUrl();
      AsyncStorage.setItem(STORAGE_API_KEY, currentApiBaseUrl);
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
  const url = `${currentApiBaseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
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
      throw new Error(`API sunucusuna bağlanılamadı (${url}). Lütfen bilgisayar ve telefonun aynı Wi-Fi ağında olduğunu kontrol ediniz.`);
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

export async function assignIncidentApi(
  incidentId: string,
  staffName: string,
  token: string,
): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${incidentId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'DISPATCHED',
      assignedStaffName: staffName,
    }),
  });
}

export async function resolveIncidentApi(
  incidentId: string,
  resolutionNote?: string,
  photoUrl?: string,
  token?: string,
): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${incidentId}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'RESOLVED_BY_STAFF',
      resolutionNote: resolutionNote || 'Görev personel tarafından sahada tamamlandı.',
      photoUrl,
    }),
  });
}

export async function createCleaningApi(
  data: {
    locationId: string;
    staffName: string;
    items?: string[];
    note?: string;
  },
  token: string,
): Promise<any> {
  return apiRequest('/cleanings', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function createAuditApi(
  data: {
    locationId: string;
    supervisorName: string;
    items?: string[];
    checklistAnswers?: Record<string, boolean>;
    note?: string;
  },
  token: string,
): Promise<any> {
  return apiRequest('/audits', token, {
    method: 'POST',
    body: JSON.stringify(data),
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
