export interface LockOptions {
  ttlMs: number;
  retryCount: number;
  retryDelayMs: number;
  driftFactor?: number;
  autoRenewLease?: boolean;
}

export interface LockHandle {
  resource: string;
  token: string;
  expiresAt: number;
  leaseRenewTimer?: NodeJS.Timeout;
}

export interface LockStorageDriver {
  acquire(resource: string, token: string, ttlMs: number): Promise<boolean>;
  release(resource: string, token: string): Promise<boolean>;
  extend(resource: string, token: string, ttlMs: number): Promise<boolean>;
}

export interface LockMetricsCollector {
  incrementLockAcquired(resource: string): void;
  incrementLockFailed(resource: string): void;
  incrementLockReleased(resource: string): void;
  recordAcquireDuration(resource: string, durationMs: number): void;
}
