import { Injectable } from '@nestjs/common';
import { CleaningRecord } from '../../entities';

export function getCurrentTimeStr(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date);
}

export function getStartOfTodayIstanbul(): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateStr = formatter.format(new Date());
  return new Date(`${dateStr}T00:00:00+03:00`);
}

export function generateIncidentId(): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INC-${map.year}${map.month}${map.day}-${map.hour}${map.minute}${map.second}-${rand}`;
}

export function evaluateSLA(
  schedule: string[],
  actualTime: string,
  toleranceMinutes = 15,
): { status: string; label: string; badgeClass: string; diff: number; targetSlot: string } {
  if (!schedule || schedule.length === 0) {
    return {
      status: 'ON_TIME',
      label: 'Zamanında',
      badgeClass: 'badge-ontime',
      diff: 0,
      targetSlot: actualTime,
    };
  }

  const [aH, aM] = actualTime.split(':').map(Number);
  const actualTotal = aH * 60 + aM;

  let closest = schedule[0];
  let minDiff = 999999;
  let signedDiff = 0;

  for (const slot of schedule) {
    const [sH, sM] = slot.split(':').map(Number);
    const slotTotal = sH * 60 + sM;
    const diff = actualTotal - slotTotal;
    if (Math.abs(diff) < minDiff) {
      minDiff = Math.abs(diff);
      signedDiff = diff;
      closest = slot;
    }
  }

  const signText = signedDiff > 0 ? `+${signedDiff} dk` : `${signedDiff} dk`;

  if (minDiff <= toleranceMinutes) {
    return {
      status: 'ON_TIME',
      label: minDiff === 0 ? 'Tam Zamanında (0 dk)' : `Zamanında / Tolerans İçi (${signText})`,
      badgeClass: 'badge-ontime',
      diff: signedDiff,
      targetSlot: closest,
    };
  } else if (signedDiff > toleranceMinutes) {
    return {
      status: 'LATE',
      label: `Gecikmeli (${signText})`,
      badgeClass: 'badge-notdone',
      diff: signedDiff,
      targetSlot: closest,
    };
  } else {
    return {
      status: 'EARLY',
      label: `Plan Dışı Erken (${signText})`,
      badgeClass: 'badge-outoftime',
      diff: signedDiff,
      targetSlot: closest,
    };
  }
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

export function evaluateDailySchedule(
  schedule: string[],
  cleanings: CleaningRecord[],
  toleranceMinutes = 15,
  currentTimeStr?: string,
): { slots: SlotEvaluation[]; missedCount: number; onTimeCount: number; lateCount: number; pendingCount: number } {
  const nowStr = currentTimeStr || getCurrentTimeStr();
  const [nowH, nowM] = nowStr.split(':').map(Number);
  const nowTotal = nowH * 60 + nowM;

  let missedCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let pendingCount = 0;

  const slots: SlotEvaluation[] = (schedule || []).map((slot) => {
    const [sH, sM] = slot.split(':').map(Number);
    const slotTotal = sH * 60 + sM;

    const matchingLog = cleanings.find((c) => c.plannedSlot === slot);

    if (matchingLog) {
      const sla = evaluateSLA(schedule, matchingLog.actualTime, toleranceMinutes);
      if (sla.status === 'ON_TIME') onTimeCount++;
      else if (sla.status === 'LATE') lateCount++;
      return {
        slot,
        actualTime: matchingLog.actualTime,
        staffName: matchingLog.staffName,
        status: sla.status as 'ON_TIME' | 'LATE' | 'EARLY',
        label: sla.label,
        badgeClass: sla.badgeClass,
        diffMinutes: sla.diff,
      };
    }

    if (nowTotal > slotTotal + toleranceMinutes) {
      missedCount++;
      const overdueMins = nowTotal - slotTotal;
      return {
        slot,
        actualTime: null,
        staffName: null,
        status: 'MISSED',
        label: `Yapılmadı / Tolerans Aşıldı (+${overdueMins} dk)`,
        badgeClass: 'badge-notdone',
        diffMinutes: overdueMins,
      };
    } else {
      pendingCount++;
      const isWithinWindow = Math.abs(nowTotal - slotTotal) <= toleranceMinutes;
      return {
        slot,
        actualTime: null,
        staffName: null,
        status: 'WAITING',
        label: isWithinWindow ? 'Müdahale Zamanı (Bekliyor)' : 'Bekliyor',
        badgeClass: isWithinWindow ? 'badge-outoftime' : 'badge-waiting',
        diffMinutes: null,
      };
    }
  });

  return {
    slots,
    missedCount,
    onTimeCount,
    lateCount,
    pendingCount,
  };
}

@Injectable()
export class SlaService {
  getCurrentTimeStr(date = new Date()): string {
    return getCurrentTimeStr(date);
  }

  getStartOfTodayIstanbul(): Date {
    return getStartOfTodayIstanbul();
  }

  generateIncidentId(): string {
    return generateIncidentId();
  }

  evaluateSLA(schedule: string[], actualTime: string, toleranceMinutes = 15) {
    return evaluateSLA(schedule, actualTime, toleranceMinutes);
  }

  evaluateDailySchedule(
    schedule: string[],
    cleanings: CleaningRecord[],
    toleranceMinutes = 15,
    currentTimeStr?: string,
  ) {
    return evaluateDailySchedule(schedule, cleanings, toleranceMinutes, currentTimeStr);
  }
}
