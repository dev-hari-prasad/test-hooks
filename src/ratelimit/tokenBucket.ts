import {
  RateLimitOptions,
  RateLimitResult,
  RateLimitStorageDriver,
  RateLimitTier,
} from './types';
import { InMemoryTokenBucketDriver } from './rateLimitStorage';
import { InMemoryRateLimitMetrics } from '../metrics/rateLimitMetrics';

export class TokenBucketRateLimiter {
  private readonly storage: RateLimitStorageDriver;
  private readonly options: RateLimitOptions;
  private readonly metrics?: InMemoryRateLimitMetrics;

  constructor(
    options: RateLimitOptions,
    storageDriver?: RateLimitStorageDriver,
    metrics?: InMemoryRateLimitMetrics
  ) {
    this.options = options;
    this.storage = storageDriver ?? new InMemoryTokenBucketDriver();
    this.metrics = metrics;
  }

  public async check(
    identifier: string,
    tierName?: string,
    tokens: number = 1
  ): Promise<RateLimitResult> {
    const startTime = Date.now();
    const tier = this.resolveTier(tierName);
    const namespacedKey = this.getNamespacedKey(identifier);

    try {
      const result = await this.storage.consumeTokens(namespacedKey, tokens, tier);
      const latencyMs = Date.now() - startTime;

      this.metrics?.recordDecision(tier.name, result.allowed, latencyMs);
      return result;
    } catch (error) {
      if (this.options.skipFailedRequests) {
        return {
          allowed: true,
          remainingTokens: 1,
          limit: tier.capacity,
          resetTimeEpochMs: Date.now() + 1000,
          tierName: tier.name,
        };
      }
      throw error;
    }
  }

  public async reset(identifier: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(identifier);
    await this.storage.resetKey(namespacedKey);
  }

  private resolveTier(tierName?: string): RateLimitTier {
    if (tierName && this.options.tiers && this.options.tiers[tierName]) {
      return this.options.tiers[tierName];
    }
    return this.options.defaultTier;
  }

  private getNamespacedKey(identifier: string): string {
    const prefix = this.options.keyPrefix ?? 'rl';
    return `${prefix}:${identifier.trim().toLowerCase()}`;
  }
}
