export type WebhookEventStatus = 'pending' | 'delivered' | 'failed' | 'retrying';

export interface WebhookPayload<T = Record<string, unknown>> {
  id: string;
  event: string;
  timestamp: number;
  data: T;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  maxRetries?: number;
  timeoutMs?: number;
  enabled: boolean;
}

export interface DeliveryAttempt {
  attemptNumber: number;
  timestamp: number;
  statusCode?: number;
  error?: string;
  durationMs: number;
  success: boolean;
}

export interface WebhookDeliveryResult {
  eventId: string;
  endpointId: string;
  status: WebhookEventStatus;
  attempts: DeliveryAttempt[];
  deliveredAt?: number;
}
