export type RateLimitStrategy = 'token_bucket' | 'sliding_window_log' | 'fixed_window';

export interface RateLimitTier {
  name: string;
  capacity: number;
  refillRatePerSec: number;
  windowMs: number;
  burstAllowance?: number;
}

export interface RateLimitOptions {
  strategy?: RateLimitStrategy;
  defaultTier: RateLimitTier;
  tiers?: Record<string, RateLimitTier>;
  keyPrefix?: string;
  enableHeaderInjection?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remainingTokens: number;
  limit: number;
  resetTimeEpochMs: number;
  retryAfterSeconds?: number;
  tierName: string;
}

export interface RateLimitStorageDriver {
  consumeTokens(
    key: string,
    tokensToConsume: number,
    tier: RateLimitTier
  ): Promise<RateLimitResult>;
  resetKey(key: string): Promise<void>;
  getKeyStatus(key: string, tier: RateLimitTier): Promise<RateLimitResult>;
}
