import { WebhookEndpoint, WebhookPayload, WebhookDeliveryResult, DeliveryAttempt } from '../types/webhook.js';
import { SignatureVerifier } from '../security/signatureVerifier.js';

export interface DispatcherOptions {
  defaultTimeoutMs?: number;
  defaultMaxRetries?: number;
  initialBackoffMs?: number;
}

export class WebhookDispatcher {
  private endpoints: Map<string, WebhookEndpoint> = new Map();
  private options: Required<DispatcherOptions>;

  constructor(options: DispatcherOptions = {}) {
    this.options = {
      defaultTimeoutMs: options.defaultTimeoutMs ?? 5000,
      defaultMaxRetries: options.defaultMaxRetries ?? 3,
      initialBackoffMs: options.initialBackoffMs ?? 500,
    };
  }

  public registerEndpoint(endpoint: WebhookEndpoint): void {
    this.endpoints.set(endpoint.id, endpoint);
  }

  public unregisterEndpoint(endpointId: string): boolean {
    return this.endpoints.delete(endpointId);
  }

  public async dispatch<T>(
    event: string,
    data: T
  ): Promise<WebhookDeliveryResult[]> {
    const payload: WebhookPayload<T> = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      event,
      timestamp: Date.now(),
      data,
    };

    const matchingEndpoints = Array.from(this.endpoints.values()).filter(
      (ep) => ep.enabled && (ep.events.includes('*') || ep.events.includes(event))
    );

    const deliveryPromises = matchingEndpoints.map((ep) =>
      this.deliverToEndpoint(ep, payload)
    );

    return Promise.all(deliveryPromises);
  }

  private async deliverToEndpoint<T>(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload<T>
  ): Promise<WebhookDeliveryResult> {
    const rawBody = JSON.stringify(payload);
    const maxRetries = endpoint.maxRetries ?? this.options.defaultMaxRetries;
    const timeoutMs = endpoint.timeoutMs ?? this.options.defaultTimeoutMs;
    const attempts: DeliveryAttempt[] = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const signatureHeader = SignatureVerifier.generateSignature(
        rawBody,
        endpoint.secret,
        Math.floor(Date.now() / 1000)
      );

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Gobe-Webhook-Dispatcher/1.0',
            'X-Webhook-Signature': signatureHeader,
            'X-Webhook-Event': payload.event,
            'X-Webhook-Delivery': payload.id,
            'X-Webhook-Attempt': String(attempt),
          },
          body: rawBody,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (response.ok) {
          attempts.push({
            attemptNumber: attempt,
            timestamp: startTime,
            statusCode: response.status,
            durationMs,
            success: true,
          });

          return {
            eventId: payload.id,
            endpointId: endpoint.id,
            status: 'delivered',
            attempts,
            deliveredAt: Date.now(),
          };
        }

        attempts.push({
          attemptNumber: attempt,
          timestamp: startTime,
          statusCode: response.status,
          error: `HTTP status ${response.status}`,
          durationMs,
          success: false,
        });
      } catch (err: any) {
        const durationMs = Date.now() - startTime;
        attempts.push({
          attemptNumber: attempt,
          timestamp: startTime,
          error: err.name === 'AbortError' ? 'Request timed out' : err.message,
          durationMs,
          success: false,
        });
      }

      if (attempt < maxRetries) {
        const backoff = this.options.initialBackoffMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }

    return {
      eventId: payload.id,
      endpointId: endpoint.id,
      status: 'failed',
      attempts,
    };
  }
}
