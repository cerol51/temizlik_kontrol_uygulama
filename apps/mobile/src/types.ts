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
