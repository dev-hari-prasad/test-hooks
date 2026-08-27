import { WebhookRetryPipeline } from '../src/pipeline/retryPipeline';
import { WebhookEvent } from '../src/types/webhook';
import { metricsRegistry } from '../src/metrics/promClient';

async function runTests() {
  console.log('--- Starting Webhook Retry Pipeline Test Suite ---');
  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  };

  // Test 1: Immediate Success Delivery
  {
    const pipeline = new WebhookRetryPipeline();
    const event: WebhookEvent = {
      id: 'evt_1',
      eventType: 'payment.completed',
      payload: { amount: 1000, currency: 'USD' },
      targetUrl: 'https://api.merchant.com/webhook',
      secret: 'whsec_test',
      createdAt: Date.now(),
    };

    const result = await pipeline.dispatch(event, async () => ({ statusCode: 200 }));
    assert(result.status === 'delivered', 'Status is delivered on HTTP 200');
    assert(result.totalAttempts === 1, 'Delivered in 1 attempt');
  }

  // Test 2: Transient 503 error recovered on attempt 2
  {
    const pipeline = new WebhookRetryPipeline({ initialDelayMs: 10, maxDelayMs: 50 });
    const event: WebhookEvent = {
      id: 'evt_2',
      eventType: 'order.created',
      payload: { orderId: 'ord_99' },
      targetUrl: 'https://api.merchant.com/webhook',
      secret: 'whsec_test',
      createdAt: Date.now(),
    };

    let callCount = 0;
    const result = await pipeline.dispatch(event, async () => {
      callCount++;
      return { statusCode: callCount === 1 ? 503 : 200 };
    });

    assert(result.status === 'delivered', 'Recovered after transient 503');
    assert(result.totalAttempts === 2, 'Total attempts is 2');
    assert(result.history[0].statusCode === 503, 'First attempt recorded 503');
    assert(result.history[1].statusCode === 200, 'Second attempt recorded 200');
  }

  // Test 3: Exhausted retries -> Moved to Dead Letter Queue (DLQ)
  {
    const pipeline = new WebhookRetryPipeline({ maxRetries: 3, initialDelayMs: 10, maxDelayMs: 30 });
    const event: WebhookEvent = {
      id: 'evt_poison_pill',
      eventType: 'user.deleted',
      payload: { userId: 'usr_xyz' },
      targetUrl: 'https://api.failing-service.com/webhook',
      secret: 'whsec_test',
      createdAt: Date.now(),
    };

    const result = await pipeline.dispatch(event, async () => ({ statusCode: 500 }));
    assert(result.status === 'dead_letter', 'Status is dead_letter when retries exhausted');
    assert(result.totalAttempts === 3, 'Tried maxRetries (3) times');

    const dlq = pipeline.getDLQ();
    assert(dlq.size() === 1, 'DLQ contains 1 failed message');
    const dlqEntry = dlq.get('evt_poison_pill');
    assert(dlqEntry !== undefined, 'Poison pill found in DLQ');
    assert(dlqEntry?.totalAttempts === 3, 'DLQ records 3 attempts');
  }

  // Test 4: Prometheus metrics registry aggregation
  {
    const metrics = metricsRegistry.getMetricsSummary();
    assert(metrics['webhook_deliveries_total'] !== undefined, 'webhook_deliveries_total metric collected');
    assert(metrics['webhook_dlq_total'] !== undefined, 'webhook_dlq_total metric collected');
  }

  console.log(`--- Results: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
