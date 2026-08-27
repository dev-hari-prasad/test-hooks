import { TokenBucketRateLimiter } from '../src/ratelimit/tokenBucket';
import { InMemoryTokenBucketDriver } from '../src/ratelimit/rateLimitStorage';
import { InMemoryRateLimitMetrics } from '../src/metrics/rateLimitMetrics';
import { createRateLimitMiddleware } from '../src/ratelimit/rateLimitMiddleware';

async function testRateLimiterSuite() {
  const metrics = new InMemoryRateLimitMetrics();
  const driver = new InMemoryTokenBucketDriver(false);

  const limiter = new TokenBucketRateLimiter(
    {
      defaultTier: {
        name: 'free',
        capacity: 5,
        refillRatePerSec: 1,
        windowMs: 5000,
        burstAllowance: 1,
      },
      tiers: {
        pro: {
          name: 'pro',
          capacity: 20,
          refillRatePerSec: 5,
          windowMs: 5000,
        },
      },
      keyPrefix: 'test_rl',
    },
    driver,
    metrics
  );

  console.log('Test 1: Consume initial bucket capacity');
  for (let i = 0; i < 6; i++) {
    const res = await limiter.check('user_123');
    if (!res.allowed) {
      throw new Error(`Expected token ${i} to be allowed`);
    }
  }

  console.log('Test 2: Exceed rate limit');
  const rejected = await limiter.check('user_123');
  if (rejected.allowed) {
    throw new Error('Expected 7th request to be rejected');
  }

  console.log('Test 3: Tier isolation');
  const proRes = await limiter.check('user_456', 'pro');
  if (!proRes.allowed || proRes.limit !== 20) {
    throw new Error('Expected pro tier user to have capacity 20');
  }

  console.log('Test 4: Middleware execution');
  const middleware = createRateLimitMiddleware(limiter);
  const headers: Record<string, any> = {};
  let statusSet = 200;
  let jsonBody: any = null;
  let nextCalled = false;

  await middleware(
    { ip: '192.168.1.1', headers: {} },
    {
      status: (code) => {
        statusSet = code;
        return { setHeader: () => {}, json: (b) => { jsonBody = b; }, status: () => ({} as any) };
      },
      setHeader: (k, v) => {
        headers[k] = v;
      },
      json: (b) => {
        jsonBody = b;
      },
    },
    () => {
      nextCalled = true;
    }
  );

  if (!nextCalled || headers['X-RateLimit-Limit'] !== 6) {
    throw new Error('Expected middleware to allow request and inject headers');
  }

  console.log('All rate limiter unit tests passed successfully!');
  driver.destroy();
}

testRateLimiterSuite().catch((err) => {
  console.error('Rate limiter test failure:', err);
});
