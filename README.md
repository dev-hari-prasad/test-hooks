# Webhook Dispatcher & Resilient Delivery Pipeline

High-throughput, fault-tolerant webhook delivery pipeline designed with exponential backoff, jitter, circuit breakers, Dead Letter Queue (DLQ), Pino structured logging, and Prometheus metrics.

## Architecture Highlights

1. **Exponential Backoff with Full Jitter**:
   - Computes backoff interval using $T = \min(T_{max}, T_{base} \times 2^{\text{attempt}}) \times \text{jitter}$ to prevent synchronized thundering herd spikes.
2. **Per-Domain Circuit Breaker**:
   - Automatically halts traffic when a destination host exceeds `failureThreshold` consecutive errors.
   - Enters `HALF_OPEN` state after `cooldownPeriodMs` to safely probe downstream health.
3. **Dead Letter Queue (DLQ)**:
   - Stores poisoned payloads after exhaustion of retry attempts with rich context: attempt timestamps, status codes, and error traces.
   - Supports on-demand inspection and replaying.
4. **Structured Pino JSON Logging**:
   - High-performance JSON log emitter with automatic redaction of secret tokens, API keys, and sensitive authorization headers.
5. **Prometheus Metrics Registry**:
   - In-memory Prometheus metric collector recording delivery counters (`webhook_deliveries_total`), latency histograms (`webhook_delivery_duration_seconds`), and circuit breaker state gauges.

---

## Quickstart

```typescript
import { WebhookRetryPipeline, DeadLetterQueue } from './src';

const pipeline = new WebhookRetryPipeline({
  maxRetries: 5,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  useJitter: true,
});

const result = await pipeline.dispatch({
  id: 'evt_99182',
  eventType: 'payment.succeeded',
  payload: { invoiceId: 'inv_123', amount: 4900 },
  targetUrl: 'https://merchant.example.com/webhooks',
  secret: 'whsec_live_key',
  createdAt: Date.now(),
}, async (url, payload, headers) => {
  return await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers });
});

if (result.status === 'dead_letter') {
  console.error('Webhook exhausted all retries and was saved to DLQ:', result.error);
}
```
