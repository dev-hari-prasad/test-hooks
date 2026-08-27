export interface MetricCounter {
  inc(labels?: Record<string, string>, value?: number): void;
}

export interface MetricHistogram {
  observe(labels: Record<string, string>, value: number): void;
}

export class InMemoryRateLimitMetrics {
  private allowedCount: Map<string, number> = new Map();
  private rejectedCount: Map<string, number> = new Map();
  private latencies: Map<string, number[]> = new Map();

  public recordDecision(tier: string, allowed: boolean, latencyMs: number): void {
    const key = tier;
    if (allowed) {
      this.allowedCount.set(key, (this.allowedCount.get(key) || 0) + 1);
    } else {
      this.rejectedCount.set(key, (this.rejectedCount.get(key) || 0) + 1);
    }

    if (!this.latencies.has(key)) {
      this.latencies.set(key, []);
    }
    const arr = this.latencies.get(key)!;
    if (arr.length > 500) arr.shift();
    arr.push(latencyMs);
  }

  public getSnapshot(): {
    allowed: Record<string, number>;
    rejected: Record<string, number>;
  } {
    return {
      allowed: Object.fromEntries(this.allowedCount),
      rejected: Object.fromEntries(this.rejectedCount),
    };
  }
}
