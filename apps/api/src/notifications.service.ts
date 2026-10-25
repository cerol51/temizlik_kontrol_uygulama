import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import webPush from 'web-push';
import { Repository } from 'typeorm';
import { NotificationDispatch, PushSubscription } from './entities';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly supervisorStreams = new Set<Response>();
  private readonly pushEnabled: boolean;

  constructor(
    @InjectRepository(NotificationDispatch)
    private readonly dispatches: Repository<NotificationDispatch>,
    @InjectRepository(PushSubscription)
    private readonly subscriptions: Repository<PushSubscription>,
  ) {
    this.pushEnabled = this.checkPushConfiguration();
    if (this.pushEnabled) {
      webPush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      );
    }
  }

  private checkPushConfiguration(): boolean {
    const values = [
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
      process.env.VAPID_SUBJECT,
    ];
    if (values.some(Boolean) && !values.every(Boolean)) {
      throw new Error('VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY ve VAPID_SUBJECT birlikte ayarlanmalıdır.');
    }
    return values.every(Boolean);
  }

  async dispatchIncidentAlert(
    incidentId: string,
    locationName: string,
    issues: string[],
    recipientSupervisorName: string,
    isEscalated = false,
  ): Promise<NotificationDispatch> {
    const title = isEscalated ? '🚨 ESKALASYON UYARISI' : '🚨 ACİL ŞİKAYET BİLDİRİMİ';
    const message = `${locationName} - Sorunlar: ${issues.join(', ')} [Sorumlu: ${recipientSupervisorName}]`;

    const dispatch = await this.dispatches.save({
      id: randomUUID(),
      incidentId,
      recipientUserId: recipientSupervisorName,
      recipientName: recipientSupervisorName,
      channel: 'WebPush / InApp',
      status: 'DELIVERED',
    });

    this.broadcast({
      type: isEscalated ? 'ESCALATION_ALERT' : 'INCIDENT_ALERT',
      incidentId,
      title,
      message,
      issues,
      recipientSupervisorName,
      isEscalated,
      timestamp: new Date().toTimeString().substring(0, 5),
    });

    if (this.pushEnabled) {
      // Push bildirimini ana HTTP yanıtını bekletmeden asenkron arka planda tetikle
      void this.sendPush(title, message, recipientSupervisorName).catch((error) => {
        this.logger.error(
          'Push bildirimi arka planda gönderilemedi.',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }

    return dispatch;
  }

  // Geriye dönük uyumluluk
  async createLowRating(
    restroomId: string,
    restroomName: string,
    surveyId: string,
    rating: number,
  ): Promise<NotificationDispatch> {
    return this.dispatchIncidentAlert(
      surveyId,
      restroomName,
      [`Düşük puan (${rating}/5)`],
      'Nöbetçi Şef',
    );
  }

  async listRecent(): Promise<NotificationDispatch[]> {
    return this.dispatches.find({
      order: { sentTimeUtc: 'DESC' },
      take: 50,
    });
  }

  addStream(response: Response): () => void {
    this.supervisorStreams.add(response);
    return () => this.supervisorStreams.delete(response);
  }

  async saveSubscription(
    supervisorId: string,
    subscription: CreatePushSubscriptionInput,
  ): Promise<void> {
    await this.subscriptions.upsert(
      {
        id: randomUUID(),
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        supervisorId,
      },
      ['endpoint'],
    );
  }

  private broadcast(payloadObj: Record<string, any>): void {
    const payload = `data: ${JSON.stringify(payloadObj)}\n\n`;
    for (const stream of this.supervisorStreams) {
      if (stream.destroyed || stream.writableEnded) {
        this.supervisorStreams.delete(stream);
        continue;
      }
      stream.write(payload);
    }
  }

  private async sendPush(title: string, message: string, supervisorId?: string): Promise<void> {
    const subscriptions = supervisorId
      ? await this.subscriptions.find({ where: { supervisorId } })
      : await this.subscriptions.find();
    // Hedef supervisor'ın aboneliği yoksa veya genel ise tüm aktif aboneliklere fallback yap
    const activeSubs = subscriptions.length > 0 ? subscriptions : await this.subscriptions.find();
    if (activeSubs.length === 0) return;

    const payload = JSON.stringify({
      title,
      body: message,
      url: '/',
    });

    const pushTasks = subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys },
          payload,
        );
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? (error as any).statusCode
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          try {
            await this.subscriptions.delete({ id: subscription.id });
          } catch (cleanupError) {
            this.logger.error(
              `Geçersiz push aboneliği ${subscription.id} silinemedi.`,
              cleanupError instanceof Error ? cleanupError.stack : String(cleanupError),
            );
          }
        } else {
          this.logger.error(
            `Push bildirimi ${subscription.id} aboneliğine gönderilemedi.`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    });

    await Promise.allSettled(pushTasks);
  }
}

export interface CreatePushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
