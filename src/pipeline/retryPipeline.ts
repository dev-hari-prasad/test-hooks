import {
  WebhookEvent,
  DeliveryAttempt,
  DeliveryResult,
  RetryPolicy,
  CircuitBreakerConfig,
  CircuitBreakerState,
} from '../types/webhook';
import { PinoLogger } from '../logger/pinoLogger';
import { DeadLetterQueue } from '../dlq/deadLetterQueue';
import { metricsRegistry } from '../metrics/promClient';

export interface TransportSender {
  (url: string, payload: unknown, headers: Record<string, string>): Promise<{ statusCode: number }>;
}

export class WebhookRetryPipeline {
  private retryPolicy: RetryPolicy;
  private cbConfig: CircuitBreakerConfig;
  private dlq: DeadLetterQueue;
  private logger = new PinoLogger('WebhookRetryPipeline');

  // Circuit breaker state per domain
  private cbStates: Map<string, {
    state: CircuitBreakerState;
    consecutiveFailures: number;
    consecutiveSuccesses: number;
    lastFailureTime: number;
  }> = new Map();

  constructor(
    retryPolicy: Partial<RetryPolicy> = {},
    cbConfig: Partial<CircuitBreakerConfig> = {},
    dlq?: DeadLetterQueue
  ) {
    this.retryPolicy = {
      maxRetries: 5,
      initialDelayMs: 500,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      useJitter: true,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
      ...retryPolicy,
    };

    this.cbConfig = {
      failureThreshold: 5,
      recoveryThreshold: 2,
      cooldownPeriodMs: 60000,
      ...cbConfig,
    };

    this.dlq = dlq || new DeadLetterQueue();
  }

  getDLQ(): DeadLetterQueue {
    return this.dlq;
  }

  calculateBackoff(attempt: number): number {
    const exponential = this.retryPolicy.initialDelayMs * Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1);
    const capped = Math.min(exponential, this.retryPolicy.maxDelayMs);

    if (!this.retryPolicy.useJitter) {
      return capped;
    }

    // Full jitter: Uniform(0.5, 1.0) * capped
    const jitterFactor = 0.5 + Math.random() * 0.5;
    return Math.round(capped * jitterFactor);
  }

  private getDomainKey(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  getCircuitState(url: string): CircuitBreakerState {
    const key = this.getDomainKey(url);
    const cb = this.cbStates.get(key);
    if (!cb) return 'CLOSED';

    if (cb.state === 'OPEN') {
      const now = Date.now();
      if (now - cb.lastFailureTime > this.cbConfig.cooldownPeriodMs) {
        cb.state = 'HALF_OPEN';
        this.logger.info('Circuit transitioned to HALF_OPEN', { domain: key });
      }
    }

    return cb.state;
  }

  private recordSuccess(url: string): void {
    const key = this.getDomainKey(url);
    let cb = this.cbStates.get(key);
    if (!cb) {
      cb = { state: 'CLOSED', consecutiveFailures: 0, consecutiveSuccesses: 0, lastFailureTime: 0 };
      this.cbStates.set(key, cb);
    }

    if (cb.state === 'HALF_OPEN') {
      cb.consecutiveSuccesses += 1;
      if (cb.consecutiveSuccesses >= this.cbConfig.recoveryThreshold) {
        cb.state = 'CLOSED';
        cb.consecutiveFailures = 0;
        this.logger.info('Circuit fully recovered to CLOSED', { domain: key });
      }
    } else if (cb.state === 'CLOSED') {
      cb.consecutiveFailures = 0;
    }

    metricsRegistry.setGauge('webhook_circuit_breaker_state', cb.state === 'CLOSED' ? 0 : cb.state === 'HALF_OPEN' ? 1 : 2, { domain: key });
  }

  private recordFailure(url: string): void {
    const key = this.getDomainKey(url);
    let cb = this.cbStates.get(key);
    if (!cb) {
      cb = { state: 'CLOSED', consecutiveFailures: 0, consecutiveSuccesses: 0, lastFailureTime: 0 };
      this.cbStates.set(key, cb);
    }

    cb.consecutiveFailures += 1;
    cb.consecutiveSuccesses = 0;
    cb.lastFailureTime = Date.now();

    if (cb.state === 'CLOSED' && cb.consecutiveFailures >= this.cbConfig.failureThreshold) {
      cb.state = 'OPEN';
      this.logger.warn('Circuit tripped to OPEN', { domain: key, failures: cb.consecutiveFailures });
    } else if (cb.state === 'HALF_OPEN') {
      cb.state = 'OPEN';
      this.logger.warn('Circuit tripped back to OPEN during recovery probe', { domain: key });
    }

    metricsRegistry.setGauge('webhook_circuit_breaker_state', cb.state === 'CLOSED' ? 0 : cb.state === 'HALF_OPEN' ? 1 : 2, { domain: key });
  }

  async dispatch(
    event: WebhookEvent,
    sender: TransportSender
  ): Promise<DeliveryResult> {
    const startTime = Date.now();
    const history: DeliveryAttempt[] = [];
    let currentAttempt = 0;

    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event.eventType,
      'X-Webhook-ID': event.id,
      'X-Webhook-Timestamp': String(Date.now()),
      ...(event.headers || {}),
    };

    while (currentAttempt < this.retryPolicy.maxRetries) {
      currentAttempt++;
      const attemptStart = Date.now();

      // Check Circuit Breaker
      const cbState = this.getCircuitState(event.targetUrl);
      if (cbState === 'OPEN') {
        const attempt: DeliveryAttempt = {
          attemptNumber: currentAttempt,
          timestamp: attemptStart,
          durationMs: 0,
          error: 'CircuitBreakerOpenException: target domain in cooldown',
        };
        history.push(attempt);
        this.logger.warn('Skipping delivery attempt due to open circuit breaker', {
          eventId: event.id,
          targetUrl: event.targetUrl,
          attempt: currentAttempt,
        });
        break;
      }

      try {
        const response = await sender(event.targetUrl, event.payload, headers);
        const durationMs = Date.now() - attemptStart;

        const isSuccess = response.statusCode >= 200 && response.statusCode < 300;
        const attempt: DeliveryAttempt = {
          attemptNumber: currentAttempt,
          timestamp: attemptStart,
          statusCode: response.statusCode,
          durationMs,
        };
        history.push(attempt);

        metricsRegistry.observeHistogram('webhook_delivery_duration_seconds', durationMs / 1000, {
          eventType: event.eventType,
          statusCode: response.statusCode,
        });

        if (isSuccess) {
          this.recordSuccess(event.targetUrl);
          metricsRegistry.incrementCounter('webhook_deliveries_total', {
            eventType: event.eventType,
            status: 'delivered',
            statusCode: response.statusCode,
          });

          return {
            eventId: event.id,
            status: 'delivered',
            totalAttempts: currentAttempt,
            totalDurationMs: Date.now() - startTime,
            finalStatusCode: response.statusCode,
            history,
          };
        }

        this.recordFailure(event.targetUrl);
        const isRetryable = this.retryPolicy.retryableStatusCodes.includes(response.statusCode);
        if (!isRetryable || currentAttempt >= this.retryPolicy.maxRetries) {
          break;
        }

        const delay = this.calculateBackoff(currentAttempt);
        attempt.nextRetryDelayMs = delay;
        this.logger.info('Scheduling retry for transient HTTP status', {
          eventId: event.id,
          statusCode: response.statusCode,
          nextAttempt: currentAttempt + 1,
          delayMs: delay,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (err: unknown) {
        const durationMs = Date.now() - attemptStart;
        this.recordFailure(event.targetUrl);

        const errorMessage = err instanceof Error ? err.message : String(err);
        const attempt: DeliveryAttempt = {
          attemptNumber: currentAttempt,
          timestamp: attemptStart,
          durationMs,
          error: errorMessage,
        };
        history.push(attempt);

        metricsRegistry.incrementCounter('webhook_deliveries_total', {
          eventType: event.eventType,
          status: 'error',
        });

        if (currentAttempt >= this.retryPolicy.maxRetries) {
          break;
        }

        const delay = this.calculateBackoff(currentAttempt);
        attempt.nextRetryDelayMs = delay;
        this.logger.warn('Transport exception during delivery, waiting backoff', {
          eventId: event.id,
          error: errorMessage,
          delayMs: delay,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted -> Move to DLQ
    const lastAttempt = history[history.length - 1];
    const failureReason = lastAttempt?.error || `HTTP ${lastAttempt?.statusCode || 'Unknown'}`;

    this.dlq.enqueue(event, failureReason, history);

    metricsRegistry.incrementCounter('webhook_deliveries_total', {
      eventType: event.eventType,
      status: 'failed',
    });

    return {
      eventId: event.id,
      status: 'dead_letter',
      totalAttempts: currentAttempt,
      totalDurationMs: Date.now() - startTime,
      finalStatusCode: lastAttempt?.statusCode,
      error: failureReason,
      history,
    };
  }
}
