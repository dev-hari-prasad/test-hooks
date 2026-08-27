# Test Hooks Repository

Testbed repository for validating automated code reviews, webhook event listeners, and CI/CD pipelines.

## Modules

### Webhook Event Dispatcher (`src/dispatcher/webhookDispatcher.ts`)
- **HMAC-SHA256 Signatures**: Prevents tampering using timestamped `v1` signatures and replay attack tolerance windows.
- **Exponential Backoff**: Automatic retry pipeline for failed deliveries with configurable backoff.
- **Multi-Endpoint Fanout**: Event-based filtering supporting wildcard and topic-specific registrations.

## Quick Start

```typescript
import { WebhookDispatcher } from './src/index.js';

const dispatcher = new WebhookDispatcher({
  defaultMaxRetries: 3,
  defaultTimeoutMs: 5000,
});

dispatcher.registerEndpoint({
  id: 'ep_billing',
  url: 'https://api.example.com/webhooks/billing',
  secret: 'whsec_secret_key_123',
  events: ['invoice.created', 'payment.succeeded'],
  enabled: true,
});

const results = await dispatcher.dispatch('invoice.created', {
  invoiceId: 'inv_1029',
  amount: 4900,
  currency: 'usd',
});
```
