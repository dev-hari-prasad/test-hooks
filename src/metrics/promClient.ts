export interface MetricLabels {
  [key: string]: string | number;
}

export class PrometheusRegistry {
  private counters: Map<string, { value: number; labels: MetricLabels }[]> = new Map();
  private gauges: Map<string, { value: number; labels: MetricLabels }[]> = new Map();
  private histograms: Map<string, { values: number[]; labels: MetricLabels }[]> = new Map();

  incrementCounter(name: string, labels: MetricLabels = {}, delta: number = 1): void {
    const list = this.counters.get(name) || [];
    const match = list.find(item => this.matchLabels(item.labels, labels));
    if (match) {
      match.value += delta;
    } else {
      list.push({ value: delta, labels });
    }
    this.counters.set(name, list);
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const list = this.gauges.get(name) || [];
    const match = list.find(item => this.matchLabels(item.labels, labels));
    if (match) {
      match.value = value;
    } else {
      list.push({ value, labels });
    }
    this.gauges.set(name, list);
  }

  observeHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const list = this.histograms.get(name) || [];
    const match = list.find(item => this.matchLabels(item.labels, labels));
    if (match) {
      match.values.push(value);
    } else {
      list.push({ values: [value], labels });
    }
    this.histograms.set(name, list);
  }

  getMetricsSummary(): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const [name, list] of this.counters.entries()) {
      output[name] = list.map(item => ({ labels: item.labels, count: item.value }));
    }

    for (const [name, list] of this.gauges.entries()) {
      output[name] = list.map(item => ({ labels: item.labels, value: item.value }));
    }

    for (const [name, list] of this.histograms.entries()) {
      output[name] = list.map(item => {
        const sorted = [...item.values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((acc, v) => acc + v, 0);
        const p50 = count > 0 ? sorted[Math.floor(count * 0.5)] : 0;
        const p95 = count > 0 ? sorted[Math.floor(count * 0.95)] : 0;
        const p99 = count > 0 ? sorted[Math.floor(count * 0.99)] : 0;
        return {
          labels: item.labels,
          count,
          sum,
          avg: count > 0 ? sum / count : 0,
          p50,
          p95,
          p99,
        };
      });
    }

    return output;
  }

  private matchLabels(a: MetricLabels, b: MetricLabels): boolean {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => a[k] === b[k]);
  }
}

export const metricsRegistry = new PrometheusRegistry();
