export interface Location {
  id: string;
  code: string;
  name: string;
  building: string;
  token: string;
  toleranceMinutes: number;
  schedule: string[];
  currentSupervisorId?: string | null;
  currentSupervisorName?: string | null;
  backupSupervisorId?: string | null;
  backupSupervisorName?: string | null;
  status: string;
}

export type Restroom = Location;

export interface Incident {
  id: string;
  locationId: string;
  locationName?: string;
  locationCode?: string;
  status: 'OPEN' | 'ESCALATED' | 'DISPATCHED' | 'RESOLVED_BY_STAFF' | 'VERIFIED_CLOSED';
  issuesJson: string[];
  signalCount: number;
  currentSupName?: string | null;
  backupSupName?: string | null;
  assignedStaffName?: string | null;
  assignedStaffId?: string | null;
  isEscalated: boolean;
  time: string;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
  photoUrl?: string | null;
}

export interface PublicLocationStatus {
  location: {
    id: string;
    code: string;
    name: string;
    building: string;
    toleranceMinutes: number;
    schedule: string[];
    status: string;
  };
  lastCleaningTime: string | null;
  todayCleanings: Array<{ time: string; targetSlot: string }>;
}

export interface SlotEvaluation {
  slot: string;
  actualTime: string | null;
  staffName: string | null;
  status: 'ON_TIME' | 'LATE' | 'EARLY' | 'MISSED' | 'WAITING';
  label: string;
  badgeClass: string;
  diffMinutes: number | null;
}

export interface SupervisorLocationStatus {
  location: Location;
  lastCleaning: {
    id: string;
    staffName: string;
    actualTime: string;
    plannedSlot: string;
    slaStatus: string;
    diffMinutes: number;
  } | null;
  lastAudit: {
    id: string;
    supervisorName: string;
    isApproved: boolean;
    templateVersion: string;
    createdAt: string;
  } | null;
  activeIncidents: Incident[];
  recentCleanings: Array<{
    id: string;
    staffName: string;
    actualTime: string;
    plannedSlot: string;
    slaStatus: string;
    diffMinutes: number;
  }>;
  dailyScheduleStatus?: {
    slots: SlotEvaluation[];
    missedCount: number;
    onTimeCount: number;
    lateCount: number;
    pendingCount: number;
  };
}

export interface DashboardKPIs {
  totalCleans: number;
  onTimeRate: number;
  outOfTimeCount: number;
  outOfTimeRate: number;
  notDoneCount: number;
  notDoneRate: number;
  missedSlotCount: number;
  totalPlannedSlotsToday: number;
  complianceRate: number;
  totalSurveys: number;
  csatRate: number;
  avgMTTR: number;
  auditCoverageRate: number;
}

export interface ParetoItem {
  issue: string;
  count: number;
}

export interface LocationMatrixRow {
  id: string;
  code: string;
  name: string;
  currentSupervisor: string;
  backupSupervisor: string;
  slotCount: number;
  toleranceMinutes: number;
  missedCount?: number;
  dailySchedule?: SlotEvaluation[];
  lastClean: string | null;
  lastAudit: string | null;
  incidentStatus: 'NORMAL' | 'DISPATCHED' | 'ESCALATED';
}

export interface AuditLogRow {
  id: string;
  timestamp: string;
  locationId: string | null;
  action: string;
  userRole: string;
  summary: string;
  createdAt: string;
}

export interface DashboardData {
  kpis: DashboardKPIs;
  paretoData: ParetoItem[];
  locationMatrix: LocationMatrixRow[];
  auditLogs: AuditLogRow[];
  allIncidents?: Incident[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  incidentId?: string;
  issues?: string[];
  isEscalated?: boolean;
  timestamp?: string;
}

export async function api<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  let response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  // Kurumsal Standart: 401 Unauthorized durumunda araya girip (interceptor)
  // HttpOnly cookie veya refresh token ile oturumu sessizce yenile ve isteği tekrar dene.
  if (
    response.status === 401 &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/refresh') &&
    !path.startsWith('/auth/register')
  ) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        const newToken = refreshData.accessToken || refreshData.token;
        if (newToken) {
          try {
            const rawUser = localStorage.getItem('wc_user');
            if (rawUser) {
              localStorage.setItem('wc_token', newToken);
            }
          } catch {
            // ignore localStorage error
          }

          // İsteği yeni access token ile tekrar dene
          response = await fetch(`/api${path}`, {
            credentials: 'include',
            ...init,
            headers: {
              ...(init.body ? { 'Content-Type': 'application/json' } : {}),
              Authorization: `Bearer ${newToken}`,
              ...init.headers,
            },
          });
        }
      }
    } catch {
      // Refresh başarısız olursa orijinal 401 hatası ile devam et
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      typeof body?.message === 'string'
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : `İstek başarısız oldu (${response.status}).`;
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function formatTime(value?: string | null): string {
  if (!value) return 'Henüz kayıt yok';
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export async function createLocation(
  data: {
    name: string;
    code?: string;
    building?: string;
    toleranceMinutes?: number;
    schedule?: string[];
    currentSupervisorName?: string;
    backupSupervisorName?: string;
  },
  token?: string,
): Promise<Location> {
  return api<Location>('/locations', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function regenerateLocationToken(
  locationId: string,
  token?: string,
): Promise<{ success: boolean; location: Location; newToken: string }> {
  return api<{ success: boolean; location: Location; newToken: string }>(
    `/locations/${locationId}/regenerate-token`,
    token,
    { method: 'POST' },
  );
}

export async function deleteLocation(
  locationId: string,
  token?: string,
): Promise<{ success: boolean }> {
  return api<{ success: boolean }>(`/locations/${locationId}`, token, {
    method: 'DELETE',
  });
}

export interface AppUser {
  id: string;
  fullName: string;
  username: string;
  role: 'employee' | 'supervisor' | 'admin';
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AppUser;
}

export async function loginApi(username: string, password: string): Promise<AuthResponse> {
  return api<AuthResponse>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function registerApi(
  fullName: string,
  username: string,
  password: string,
  role?: string,
): Promise<AuthResponse> {
  return api<AuthResponse>('/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({ fullName, username, password, role }),
  });
}

export async function logoutApi(): Promise<{ success: boolean; message: string }> {
  return api<{ success: boolean; message: string }>('/auth/logout', undefined, {
    method: 'POST',
  });
}

export async function fetchUsersApi(token?: string): Promise<AppUser[]> {
  return api<AppUser[]>('/auth/users', token);
}

export async function fetchStaffUsersApi(token?: string): Promise<AppUser[]> {
  return api<AppUser[]>('/auth/users/staff', token);
}

export async function createUserApi(
  data: { fullName: string; username: string; password: string; role?: string },
  token?: string,
): Promise<AppUser> {
  return api<AppUser>('/auth/users', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteUserApi(id: string, token?: string): Promise<{ success: boolean; message: string }> {
  return api<{ success: boolean; message: string }>(`/auth/users/${id}`, token, {
    method: 'DELETE',
  });
}

export interface ActiveChecklist {
  id?: string;
  versionTag?: string;
  title?: string;
  template?: {
    id: string;
    version: string;
    title: string;
    isActive: boolean;
  };
  items: Array<
    | string
    | {
        id: string;
        label: string;
        orderNum: number;
        weight: number;
      }
  >;
}

export async function fetchActiveChecklistApi(): Promise<ActiveChecklist> {
  return api<ActiveChecklist>('/checklists/active');
}

export async function downloadCsvApi(
  type: 'audit' | 'cleanings' | 'incidents' = 'audit',
  token?: string,
): Promise<void> {
  const response = await fetch(`/api/reports/export-csv?type=${type}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`CSV raporu indirilemedi (${response.status}).`);
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().substring(0, 10);
  const defaultNames: Record<string, string> = {
    cleanings: `WC_Temizlik_Kayitlari_${dateStr}.csv`,
    incidents: `WC_Ariza_Sikayet_Raporu_${dateStr}.csv`,
    audit: `WC_Denetim_Izleme_Raporu_${dateStr}.csv`,
  };
  a.download = defaultNames[type] || `WC_Rapor_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const downloadAuditCsvApi = (token?: string) => downloadCsvApi('audit', token);


