import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, NativeModules, Platform } from 'react-native';
import {
  AppUser,
  AuthResponse,
  Incident,
  Location,
  PublicLocationStatus,
  SupervisorLocationStatus,
} from './types';

// Extract the host that served the React Native JavaScript bundle
export function getBundleServerUrl(): string | null {
  try {
    const scriptURL = NativeModules?.SourceCode?.scriptURL;
    if (scriptURL && typeof scriptURL === 'string') {
      const match = scriptURL.match(/^(https?:\/\/[^\/]+)/);
      if (match) {
        return match[1]; // e.g. "http://192.168.1.106:8081" or "https://hgaxaio-anonymous-8081.exp.direct"
      }
    }
  } catch {
    // ignore
  }
  return null;
}

// Generate ordered list of candidate API base URLs based on runtime environment
export function getCandidateApiUrls(): string[] {
  const candidates: string[] = [];

  // 1. In Web Browser, relative /api or current origin is king
  if (typeof window !== 'undefined' && window.location?.origin) {
    candidates.push('/api');
    candidates.push(`${window.location.origin}/api`);
  }

  // 2. Environment variable if explicitly defined
  if (process.env.EXPO_PUBLIC_API_URL) {
    candidates.push(process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, ''));
  }

  // 3. React Native bundle host (where the phone downloaded the app from)
  const bundleHost = getBundleServerUrl();
  if (bundleHost) {
    // Metro port 8081 proxies /api to port 3000
    candidates.push(`${bundleHost}/api`);
    if (bundleHost.includes(':8081')) {
      candidates.push(bundleHost.replace(':8081', ':3000') + '/api');
    }
  }

  // 4. Configured tunnel or custom environment host
  if (process.env.EXPO_PUBLIC_TUNNEL_URL) {
    candidates.push(process.env.EXPO_PUBLIC_TUNNEL_URL.replace(/\/+$/, '') + '/api');
  }

  // 5. Android emulator loopback
  if (Platform.OS === 'android') {
    candidates.push('http://10.0.2.2:3000/api');
    candidates.push('http://10.0.2.2:8081/api');
  }

  // 6. Localhost fallback
  candidates.push('http://localhost:3000/api');

  // Deduplicate while preserving order
  return Array.from(new Set(candidates));
}

function getDefaultApiUrl(): string {
  if (typeof window !== 'undefined' && window.location) {
    return '/api';
  }
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const bundleHost = getBundleServerUrl();
  if (bundleHost) {
    return `${bundleHost}/api`;
  }
  return 'http://localhost:3000/api';
}

const STORAGE_API_KEY = 'wc_mobile_api_url';
let currentApiBaseUrl = getDefaultApiUrl();

// Initialize from storage
export async function initApiBaseUrl(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_API_KEY);
    if (saved && saved.trim()) {
      const trimmed = saved.trim().replace(/\/+$/, '');
      const isLoopback =
        trimmed.includes('localhost') ||
        trimmed.includes('127.0.0.1') ||
        trimmed.includes('10.0.2.2');
      // If running on a physical device, ignore saved loopback if we have a real bundle host
      if (Platform.OS !== 'web' && isLoopback) {
        const bundleHost = getBundleServerUrl();
        if (bundleHost && !bundleHost.includes('localhost') && !bundleHost.includes('127.0.0.1')) {
          currentApiBaseUrl = `${bundleHost}/api`;
          await AsyncStorage.setItem(STORAGE_API_KEY, currentApiBaseUrl);
          return currentApiBaseUrl;
        }
      }
      currentApiBaseUrl = trimmed;
    } else {
      currentApiBaseUrl = getDefaultApiUrl();
    }
  } catch {
    currentApiBaseUrl = getDefaultApiUrl();
  }
  return currentApiBaseUrl;
}

// Fire immediately as well
void initApiBaseUrl();

export function getApiBaseUrl(): string {
  return currentApiBaseUrl;
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const trimmed = url.replace(/\/+$/, '');
  currentApiBaseUrl = trimmed;
  await AsyncStorage.setItem(STORAGE_API_KEY, trimmed);
}

// Test connectivity to a specific API URL
export async function testConnectionApi(
  customUrl?: string,
): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const start = Date.now();
  const testBase = (customUrl || currentApiBaseUrl).replace(/\/+$/, '');
  const url = testBase.endsWith('/api') ? `${testBase}/locations` : `${testBase}/api/locations`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, message: `Bağlantı başarılı (${latencyMs} ms)`, latencyMs };
    }
    return { ok: false, message: `Sunucu yanıt verdi ancak durum kodu: ${res.status}`, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return { ok: false, message: err?.message || 'Bağlantı kurulamadı', latencyMs };
  }
}

export function showAlert(title: string, message: string, onOk?: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title ? title + ': ' : ''}${message}`);
    if (onOk) onOk();
  } else {
    Alert.alert(title, message, onOk ? [{ text: 'Tamam', onPress: onOk }] : undefined);
  }
}

function buildFullUrl(base: string, endpoint: string): string {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (!cleanBase.endsWith('/api') && !cleanEndpoint.startsWith('/api') && cleanBase !== '') {
    return `${cleanBase}/api${cleanEndpoint}`;
  }
  return `${cleanBase}${cleanEndpoint}`;
}

export async function apiRequest<T>(
  endpoint: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const primaryUrl = buildFullUrl(currentApiBaseUrl, endpoint);
  const attemptedUrls: string[] = [primaryUrl];

  // Helper to execute single fetch attempt
  async function executeFetch(url: string, timeoutMs = 7000): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
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
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // Attempt with currentApiBaseUrl first
  try {
    return await executeFetch(primaryUrl);
  } catch (err: any) {
    const isNetworkError =
      err.name === 'TypeError' ||
      err.name === 'AbortError' ||
      err.message?.includes('fetch') ||
      err.message?.includes('Network') ||
      err.message?.includes('Failed to fetch') ||
      err.message?.includes('aborted');

    // Only attempt failover if it is truly a connection/network issue, not a 400/401/403/404/500 API error
    if (!isNetworkError) {
      throw err;
    }

    // Try other candidate URLs automatically
    const candidates = getCandidateApiUrls();
    for (const cand of candidates) {
      const fallbackUrl = buildFullUrl(cand, endpoint);
      if (attemptedUrls.includes(fallbackUrl)) continue;
      attemptedUrls.push(fallbackUrl);

      try {
        const result = await executeFetch(fallbackUrl, 3500);
        // Candidate succeeded! Auto-update currentApiBaseUrl and persist
        currentApiBaseUrl = cand.replace(/\/+$/, '');
        AsyncStorage.setItem(STORAGE_API_KEY, currentApiBaseUrl).catch(() => {});
        return result;
      } catch (fallbackErr: any) {
        // If it was an API error (not network error), rethrow it
        const isFallbackNetwork =
          fallbackErr.name === 'TypeError' ||
          fallbackErr.name === 'AbortError' ||
          fallbackErr.message?.includes('fetch') ||
          fallbackErr.message?.includes('Network') ||
          fallbackErr.message?.includes('Failed to fetch') ||
          fallbackErr.message?.includes('aborted');
        if (!isFallbackNetwork) {
          throw fallbackErr;
        }
      }
    }

    throw new Error(
      `API sunucusuna bağlanılamadı (${primaryUrl}). Lütfen cihazınızın Wi-Fi veya internet bağlantısını kontrol ediniz. (Ayarlar menüsünden sunucu adresini değiştirebilirsiniz)`,
    );
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
  if (tokenOrId.startsWith('token-')) {
    return apiRequest<PublicLocationStatus>(`/q/${tokenOrId}`);
  }
  return apiRequest<PublicLocationStatus>(`/locations/${tokenOrId}/public`);
}

export async function resolveQrTokenApi(token: string): Promise<PublicLocationStatus> {
  return apiRequest<PublicLocationStatus>(`/q/${token}`);
}

export async function fetchActiveChecklistApi(): Promise<{ versionTag: string; title: string; items: string[] }> {
  return apiRequest<{ versionTag: string; title: string; items: string[] }>('/checklists/active');
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
  return apiRequest<SupervisorLocationStatus>(`/locations/${locationId}/supervisor`, token);
}

export async function fetchAllIncidentsApi(token: string): Promise<Incident[]> {
  const incidents = await apiRequest<Incident[]>('/incidents', token);
  return incidents || [];
}

// 4. Şef Olay Görevlendirme (Dispatch) -> POST /incidents/:id/dispatch
export async function assignIncidentApi(
  incidentId: string,
  staffName: string,
  token: string,
  staffId?: string,
): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${incidentId}/dispatch`, token, {
    method: 'POST',
    body: JSON.stringify({
      assignedStaffName: staffName,
      assignedStaffId: staffId || undefined,
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

// 6. Şef Doğrulama ve Kapatma (Verify & Close) -> POST /incidents/:id/verify-close
export async function verifyAndCloseIncidentApi(
  incidentId: string,
  note?: string,
  token?: string,
): Promise<Incident> {
  return apiRequest<Incident>(`/incidents/${incidentId}/verify-close`, token, {
    method: 'POST',
    body: JSON.stringify({
      note: note || 'Şef tarafından sahada denetlenerek doğrulandı ve kapatıldı.',
    }),
  });
}

// 1. Personel Temizlik Kaydı -> POST /locations/:id/cleanings
export async function createCleaningApi(
  data: {
    locationId: string;
    locationToken?: string;
    staffName: string;
    items?: string[];
    note?: string;
    idempotencyKey?: string;
  },
  token: string,
): Promise<any> {
  const idempotencyKey =
    data.idempotencyKey || `mob_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  return apiRequest(`/locations/${data.locationId}/cleanings`, token, {
    method: 'POST',
    body: JSON.stringify({
      tasksConfirmed: true,
      note: data.note || 'Rutin temizlik tamamlandı.',
      locationToken: data.locationToken,
      idempotencyKey,
    }),
  });
}

// 2. Şef Sürümlü Denetim (Checklist v1.2) -> POST /locations/:id/audits
export async function createAuditApi(
  data: {
    locationId: string;
    locationToken?: string;
    isApproved: boolean;
    checklist: Array<{ id: number; label: string; isOk: boolean }>;
    note?: string;
    templateVersion?: string;
  },
  token: string,
): Promise<any> {
  return apiRequest(`/locations/${data.locationId}/audits`, token, {
    method: 'POST',
    body: JSON.stringify({
      isApproved: data.isApproved,
      checklist: data.checklist,
      note: data.note?.trim() || (data.isApproved ? 'Eksiksiz onaylandı.' : 'Uygunsuzluk tespit edildi.'),
      templateVersion: data.templateVersion || 'v1.2',
      locationToken: data.locationToken,
    }),
  });
}

export async function fetchStaffUsersApi(token: string): Promise<AppUser[]> {
  const users = await apiRequest<AppUser[]>('/auth/users/staff', token);
  return users.filter((u) => u.role === 'employee');
}

export function formatTime(value?: string | null): string {
  if (!value) return 'Kayıt yok';
  const trimmed = value.trim();
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch {
    return value;
  }
}
