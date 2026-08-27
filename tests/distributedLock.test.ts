import { DistributedLockManager } from '../src/lock/distributedLock';
import { LockStorageDriver, LockMetricsCollector } from '../src/lock/lockTypes';

class InMemoryLockDriver implements LockStorageDriver {
  private locks = new Map<string, { token: string; expiresAt: number }>();

  async acquire(resource: string, token: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.locks.get(resource);
    if (existing && existing.expiresAt > now) {
      return false;
    }
    this.locks.set(resource, { token, expiresAt: now + ttlMs });
    return true;
  }

  async release(resource: string, token: string): Promise<boolean> {
    const existing = this.locks.get(resource);
    if (existing && existing.token === token) {
      this.locks.delete(resource);
      return true;
    }
    return false;
  }

  async extend(resource: string, token: string, ttlMs: number): Promise<boolean> {
    const existing = this.locks.get(resource);
    if (existing && existing.token === token) {
      existing.expiresAt = Date.now() + ttlMs;
      return true;
    }
    return false;
  }
}

async function runTests() {
  const driver = new InMemoryLockDriver();
  const manager = new DistributedLockManager(driver, { ttlMs: 1000, retryCount: 2 });

  console.log('Test 1: Acquire lock');
  const lock = await manager.acquire('order:1001');
  if (!lock) throw new Error('Failed to acquire lock');

  console.log('Test 2: Prevent concurrent lock');
  const lock2 = await manager.acquire('order:1001', { retryCount: 0 });
  if (lock2) throw new Error('Expected lock acquisition to fail for contested resource');

  console.log('Test 3: Release lock');
  const released = await manager.release(lock);
  if (!released) throw new Error('Expected lock to be successfully released');

  console.log('All tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
});
