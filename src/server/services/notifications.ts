import type { PlannedNotification } from '@shared/reminders';
import webpush from 'web-push';
import type { Db } from '../db';
import {
  deleteSubscription,
  enqueue,
  listSubscriptions,
  markOutbox,
  pendingOutbox,
  recordPushResult,
  type PushSubscriptionRecord,
} from '../repos/push';

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export type SendResult = { ok: true } | { ok: false; gone: boolean; error: string };

export interface PushSender {
  readonly enabled: boolean;
  send(subscription: PushSubscriptionRecord, payload: PushPayload, urgent: boolean): Promise<SendResult>;
}

export const disabledPushSender: PushSender = {
  enabled: false,
  async send() {
    return { ok: false, gone: false, error: 'Push is not configured (missing VAPID keys)' };
  },
};

export function createWebPushSender(vapid: {
  publicKey: string;
  privateKey: string;
  subject: string;
}): PushSender {
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
  return {
    enabled: true,
    async send(subscription, payload, urgent) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          JSON.stringify(payload),
          { TTL: 12 * 60 * 60, urgency: urgent ? 'high' : 'normal', topic: payload.tag.slice(0, 32) },
        );
        return { ok: true };
      } catch (err) {
        const status = err instanceof webpush.WebPushError ? err.statusCode : 0;
        return {
          ok: false,
          // 404/410: the browser dropped this subscription; stop using it.
          gone: status === 404 || status === 410,
          error: err instanceof Error ? `${status || ''} ${err.message}`.trim() : String(err),
        };
      }
    },
  };
}

export interface DispatchResult {
  sent: number;
  failed: number;
  skipped: number;
}

/** Queues notifications in the outbox and delivers due ones over Web Push. */
export class Notifier {
  private running: Promise<DispatchResult> | null = null;

  constructor(
    private readonly db: Db,
    private readonly sender: PushSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get enabled(): boolean {
    return this.sender.enabled;
  }

  enqueue(planned: PlannedNotification[]): number {
    return planned.length ? enqueue(this.db, planned, this.now()) : 0;
  }

  /** Sends everything due. Concurrent calls share one run, so nothing is sent twice. */
  dispatch(): Promise<DispatchResult> {
    if (!this.running) {
      this.running = this.dispatchOnce().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  private async dispatchOnce(): Promise<DispatchResult> {
    const result: DispatchResult = { sent: 0, failed: 0, skipped: 0 };
    if (!this.sender.enabled) return result;
    for (const item of pendingOutbox(this.db, this.now())) {
      const subscriptions = listSubscriptions(this.db, item.userId);
      if (subscriptions.length === 0) {
        markOutbox(this.db, item.id, { sent: true, error: 'no subscriptions' });
        result.skipped += 1;
        continue;
      }
      const urgent = item.kind === 'safety' || item.kind === 'assignment';
      let delivered = false;
      const errors: string[] = [];
      for (const subscription of subscriptions) {
        const outcome = await this.sender.send(subscription, item.payload, urgent);
        if (outcome.ok) {
          delivered = true;
          recordPushResult(this.db, subscription.id, true);
        } else if (outcome.gone) {
          deleteSubscription(this.db, subscription.endpoint);
        } else {
          errors.push(outcome.error);
          recordPushResult(this.db, subscription.id, false);
        }
      }
      if (delivered || errors.length === 0) {
        markOutbox(this.db, item.id, { sent: true, error: delivered ? undefined : 'subscriptions expired' });
        result.sent += delivered ? 1 : 0;
        result.skipped += delivered ? 0 : 1;
      } else {
        markOutbox(this.db, item.id, { sent: false, error: errors.join('; ').slice(0, 500) });
        result.failed += 1;
      }
    }
    return result;
  }
}
