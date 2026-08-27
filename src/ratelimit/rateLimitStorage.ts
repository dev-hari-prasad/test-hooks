import {
  RateLimitStorageDriver,
  RateLimitTier,
  RateLimitResult,
} from './types';

interface BucketState {
  tokens: number;
  lastRefillEpochMs: number;
}

export class InMemoryTokenBucketDriver implements RateLimitStorageDriver {
  private buckets: Map<string, BucketState> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(enableAutoCleanup: boolean = true) {
    if (enableAutoCleanup) {
      this.cleanupInterval = setInterval(() => this.purgeStaleBuckets(), 60_000);
    }
  }

  public async consumeTokens(
    key: string,
    tokensToConsume: number,
    tier: RateLimitTier
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const capacity = tier.capacity + (tier.burstAllowance ?? 0);
    const refillRate = tier.refillRatePerSec / 1000;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: capacity,
        lastRefillEpochMs: now,
      };
      this.buckets.set(key, bucket);
    } else {
      const elapsedMs = Math.max(0, now - bucket.lastRefillEpochMs);
      const tokensToAdd = elapsedMs * refillRate;
      bucket.tokens = Math.min(capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefillEpochMs = now;
    }

    if (bucket.tokens >= tokensToConsume) {
      bucket.tokens -= tokensToConsume;
      const resetTimeEpochMs = now + Math.ceil((capacity - bucket.tokens) / refillRate);
      return {
        allowed: true,
        remainingTokens: Math.floor(bucket.tokens),
        limit: capacity,
        resetTimeEpochMs,
        tierName: tier.name,
      };
    }

    const deficit = tokensToConsume - bucket.tokens;
    const waitTimeMs = Math.ceil(deficit / refillRate);
    const resetTimeEpochMs = now + waitTimeMs;

    return {
      allowed: false,
      remainingTokens: Math.floor(bucket.tokens),
      limit: capacity,
      resetTimeEpochMs,
      retryAfterSeconds: Math.max(1, Math.ceil(waitTimeMs / 1000)),
      tierName: tier.name,
    };
  }

  public async getKeyStatus(
    key: string,
    tier: RateLimitTier
  ): Promise<RateLimitResult> {
    return this.consumeTokens(key, 0, tier);
  }

  public async resetKey(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.buckets.clear();
  }

  private purgeStaleBuckets(): void {
    const cutoff = Date.now() - 300_000;
    for (const [key, state] of this.buckets.entries()) {
      if (state.lastRefillEpochMs < cutoff) {
        this.buckets.delete(key);
      }
    }
  }
}
