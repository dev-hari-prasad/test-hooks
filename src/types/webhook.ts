export type WebhookStatus = 'queued' | 'in_flight' | 'delivered' | 'failed' | 'dead_letter';

export type CircuitBreakerState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  eventType: string;
  payload: T;
  targetUrl: string;
  secret: string;
  createdAt: number;
  headers?: Record<string, string>;
}

export interface DeliveryAttempt {
  attemptNumber: number;
  timestamp: number;
  statusCode?: number;
  durationMs: number;
  error?: string;
  nextRetryDelayMs?: number;
}

export interface DeliveryResult {
  eventId: string;
  status: WebhookStatus;
  totalAttempts: number;
  totalDurationMs: number;
  finalStatusCode?: number;
  error?: string;
  history: DeliveryAttempt[];
}

export interface DLQEntry {
  event: WebhookEvent;
  failureReason: string;
  failedAt: number;
  totalAttempts: number;
  history: DeliveryAttempt[];
}

export interface RetryPolicy {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  useJitter: boolean;
  retryableStatusCodes: number[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryThreshold: number;
  cooldownPeriodMs: number;
}
