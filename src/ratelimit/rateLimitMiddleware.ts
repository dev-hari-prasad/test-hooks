import { TokenBucketRateLimiter } from './tokenBucket';
import { RateLimitResult } from './types';

export interface HttpRequestContext {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  apiKey?: string;
  userTier?: string;
}

export interface HttpResponseContext {
  status(code: number): HttpResponseContext;
  setHeader(name: string, value: string | number): void;
  json(body: any): void;
}

export function createRateLimitMiddleware(
  limiter: TokenBucketRateLimiter,
  keyExtractor?: (req: HttpRequestContext) => string
) {
  return async (
    req: HttpRequestContext,
    res: HttpResponseContext,
    next: () => void | Promise<void>
  ) => {
    const key = keyExtractor
      ? keyExtractor(req)
      : req.apiKey || req.ip || 'anonymous_client';

    const result: RateLimitResult = await limiter.check(key, req.userTier, 1);

    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remainingTokens);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTimeEpochMs / 1000));
    res.setHeader('X-RateLimit-Tier', result.tierName);

    if (!result.allowed) {
      if (result.retryAfterSeconds) {
        res.setHeader('Retry-After', result.retryAfterSeconds);
      }
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please throttle your requests.',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }

    await next();
  };
}
