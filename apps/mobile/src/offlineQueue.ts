import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAuditApi,
  createCleaningApi,
  isNetworkError,
  resolveIncidentApi,
  verifyAndCloseIncidentApi,
} from './api';

export interface QueuedCleaningPayload {
  locationId: string;
  locationToken?: string;
  staffName: string;
  items?: string[];
  note?: string;
  idempotencyKey: string;
}

export interface QueuedResolvePayload {
  incidentId: string;
  resolutionNote?: string;
  photoUrl?: string;
}

export interface QueuedAuditPayload {
  locationId: string;
  locationToken?: string;
  isApproved: boolean;
  checklist: Array<{ id: number; label: string; isOk: boolean }>;
  note?: string;
  templateVersion?: string;
}

export interface QueuedVerifyClosePayload {
  incidentId: string;
  note?: string;
}

export type QueuedAction =
  | {
      id: string;
      type: 'CLEANING';
      idempotencyKey: string;
      createdAt: number;
      payload: QueuedCleaningPayload;
      retryCount: number;
    }
  | {
      id: string;
      type: 'RESOLVE_INCIDENT';
      idempotencyKey: string;
      createdAt: number;
      payload: QueuedResolvePayload;
      retryCount: number;
    }
  | {
      id: string;
      type: 'AUDIT';
      idempotencyKey: string;
      createdAt: number;
      payload: QueuedAuditPayload;
      retryCount: number;
    }
  | {
      id: string;
      type: 'VERIFY_CLOSE';
      idempotencyKey: string;
      createdAt: number;
      payload: QueuedVerifyClosePayload;
      retryCount: number;
    };

const STORAGE_QUEUE_KEY = '@wc_mobile_offline_queue_v1';

export async function getOfflineQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getPendingActionsCount(): Promise<number> {
  const queue = await getOfflineQueue();
  return queue.length;
}

export async function enqueueAction(
  action:
    | { type: 'CLEANING'; idempotencyKey: string; payload: QueuedCleaningPayload }
    | { type: 'RESOLVE_INCIDENT'; idempotencyKey: string; payload: QueuedResolvePayload }
    | { type: 'AUDIT'; idempotencyKey: string; payload: QueuedAuditPayload }
    | { type: 'VERIFY_CLOSE'; idempotencyKey: string; payload: QueuedVerifyClosePayload },
): Promise<void> {
  try {
    const queue = await getOfflineQueue();
    const item: QueuedAction = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      createdAt: Date.now(),
      retryCount: 0,
      ...action,
    };
    queue.push(item);
    await AsyncStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Çevrimdışı kuyruğa eklenemedi:', err);
  }
}

export async function syncPendingQueue(
  token: string,
): Promise<{ synced: number; failed: number; remaining: number }> {
  if (!token) return { synced: 0, failed: 0, remaining: 0 };
  const queue = await getOfflineQueue();
  if (queue.length === 0) return { synced: 0, failed: 0, remaining: 0 };

  const remaining: QueuedAction[] = [];
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      if (item.type === 'CLEANING') {
        await createCleaningApi(item.payload, token);
        synced++;
      } else if (item.type === 'RESOLVE_INCIDENT') {
        await resolveIncidentApi(
          item.payload.incidentId,
          item.payload.resolutionNote,
          item.payload.photoUrl,
          token,
        );
        synced++;
      } else if (item.type === 'AUDIT') {
        await createAuditApi(item.payload, token);
        synced++;
      } else if (item.type === 'VERIFY_CLOSE') {
        await verifyAndCloseIncidentApi(item.payload.incidentId, item.payload.note, token);
        synced++;
      }
    } catch (err: any) {
      if (isNetworkError(err)) {
        // Ağ hala kapalı; kalan tüm öğeleri kuyrukta tut ve işlemi durdur
        remaining.push(item);
        failed++;
        break;
      }

      // Kalıcı iş mantığı hatası (örneğin 400 veya bilet zaten kapatılmış)
      item.retryCount += 1;
      if (item.retryCount < 5) {
        remaining.push(item);
      }
      failed++;
    }
  }

  // İşlenenleri düşüp kalanı kaydet
  await AsyncStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(remaining));
  return { synced, failed, remaining: remaining.length };
}

export async function clearOfflineQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_QUEUE_KEY);
  } catch {}
}
