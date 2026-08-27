import { WebhookEvent, DLQEntry, DeliveryAttempt } from '../types/webhook';
import { PinoLogger } from '../logger/pinoLogger';
import { metricsRegistry } from '../metrics/promClient';

export class DeadLetterQueue {
  private store: Map<string, DLQEntry> = new Map();
  private logger = new PinoLogger('DeadLetterQueue');

  enqueue(event: WebhookEvent, failureReason: string, history: DeliveryAttempt[]): DLQEntry {
    const entry: DLQEntry = {
      event,
      failureReason,
      failedAt: Date.now(),
      totalAttempts: history.length,
      history,
    };

    this.store.set(event.id, entry);
    this.logger.warn('Event moved to Dead Letter Queue', {
      eventId: event.id,
      eventType: event.eventType,
      targetUrl: event.targetUrl,
      attempts: history.length,
      reason: failureReason,
    });

    metricsRegistry.incrementCounter('webhook_dlq_total', {
      eventType: event.eventType,
      reason: failureReason,
    });

    return entry;
  }

  get(eventId: string): DLQEntry | undefined {
    return this.store.get(eventId);
  }

  list(): DLQEntry[] {
    return Array.from(this.store.values());
  }

  size(): number {
    return this.store.size;
  }

  remove(eventId: string): boolean {
    return this.store.delete(eventId);
  }

  purge(): number {
    const count = this.store.size;
    this.store.clear();
    this.logger.info('Dead Letter Queue purged', { purgedCount: count });
    return count;
  }
}
