import crypto from 'node:crypto';
import {
  LockOptions,
  LockHandle,
  LockStorageDriver,
  LockMetricsCollector,
} from './lockTypes';

const DEFAULT_OPTIONS: LockOptions = {
  ttlMs: 5000,
  retryCount: 3,
  retryDelayMs: 200,
  driftFactor: 0.01,
  autoRenewLease: false,
};

export class DistributedLockManager {
  private readonly storage: LockStorageDriver;
  private readonly metrics?: LockMetricsCollector;
  private readonly defaultOptions: LockOptions;

  constructor(
    storage: LockStorageDriver,
    options?: Partial<LockOptions>,
    metrics?: LockMetricsCollector
  ) {
    this.storage = storage;
    this.metrics = metrics;
    this.defaultOptions = { ...DEFAULT_OPTIONS, ...options };
  }

  public async acquire(
    resource: string,
    options?: Partial<LockOptions>
  ): Promise<LockHandle | null> {
    const opts: LockOptions = { ...this.defaultOptions, ...options };
    const token = crypto.randomUUID();
    const startTime = Date.now();

    for (let attempt = 0; attempt <= opts.retryCount; attempt++) {
      const acquired = await this.storage.acquire(resource, token, opts.ttlMs);
      if (acquired) {
        const drift = Math.round((opts.driftFactor ?? 0.01) * opts.ttlMs) + 2;
        const validityTime = opts.ttlMs - (Date.now() - startTime) - drift;

        if (validityTime > 0) {
          this.metrics?.incrementLockAcquired(resource);
          this.metrics?.recordAcquireDuration(resource, Date.now() - startTime);

          const handle: LockHandle = {
            resource,
            token,
            expiresAt: Date.now() + validityTime,
          };

          if (opts.autoRenewLease) {
            this.startLeaseHeartbeat(handle, opts.ttlMs);
          }

          return handle;
        }

        // Validity expired during acquisition process, release lock
        await this.storage.release(resource, token);
      }

      if (attempt < opts.retryCount) {
        const jitter = Math.floor(Math.random() * (opts.retryDelayMs / 2));
        await new Promise((resolve) =>
          setTimeout(resolve, opts.retryDelayMs + jitter)
        );
      }
    }

    this.metrics?.incrementLockFailed(resource);
    return null;
  }

  public async release(handle: LockHandle): Promise<boolean> {
    if (handle.leaseRenewTimer) {
      clearInterval(handle.leaseRenewTimer);
    }
    const released = await this.storage.release(handle.resource, handle.token);
    if (released) {
      this.metrics?.incrementLockReleased(handle.resource);
    }
    return released;
  }

  public async extend(
    handle: LockHandle,
    ttlMs?: number
  ): Promise<boolean> {
    const extendTtl = ttlMs ?? this.defaultOptions.ttlMs;
    const success = await this.storage.extend(
      handle.resource,
      handle.token,
      extendTtl
    );
    if (success) {
      handle.expiresAt = Date.now() + extendTtl;
    }
    return success;
  }

  private startLeaseHeartbeat(handle: LockHandle, ttlMs: number): void {
    const intervalMs = Math.max(Math.floor(ttlMs / 3), 1000);
    handle.leaseRenewTimer = setInterval(async () => {
      try {
        const renewed = await this.storage.extend(
          handle.resource,
          handle.token,
          ttlMs
        );
        if (!renewed && handle.leaseRenewTimer) {
          clearInterval(handle.leaseRenewTimer);
        }
      } catch {
        if (handle.leaseRenewTimer) {
          clearInterval(handle.leaseRenewTimer);
        }
      }
    }, intervalMs);
  }
}
