export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export class SlidingWindowRateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(private config: RateLimitConfig) {}

  public isAllowed(clientId: string): boolean {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const clientTimestamps = (this.requests.get(clientId) || []).filter(
      (ts) => ts > windowStart
    );

    if (clientTimestamps.length >= this.config.maxRequests) {
      return false;
    }

    clientTimestamps.push(now);
    this.requests.set(clientId, clientTimestamps);
    return true;
  }

  public reset(clientId?: string): void {
    if (clientId) {
      this.requests.delete(clientId);
    } else {
      this.requests.clear();
    }
  }
}
