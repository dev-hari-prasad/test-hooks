export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    code?: string | number;
  };
}

const REDACT_KEYS = new Set(['secret', 'authorization', 'apiKey', 'token', 'password']);

export class PinoLogger {
  private component: string;

  constructor(component: string = 'WebhookPipeline') {
    this.component = component;
  }

  private sanitize(obj: unknown, depth = 0): unknown {
    if (depth > 5 || obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item, depth + 1));
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (REDACT_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value, depth + 1);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private format(level: LogLevel, message: string, context?: Record<string, unknown>, err?: Error): string {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context ? (this.sanitize({ component: this.component, ...context }) as Record<string, unknown>) : { component: this.component },
    };

    if (err) {
      entry.error = {
        message: err.message,
        stack: err.stack,
        code: (err as unknown as { code?: string }).code,
      };
    }

    return JSON.stringify(entry);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(this.format('debug', message, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    console.info(this.format('info', message, context));
  }

  warn(message: string, context?: Record<string, unknown>, err?: Error): void {
    console.warn(this.format('warn', message, context, err));
  }

  error(message: string, context?: Record<string, unknown>, err?: Error): void {
    console.error(this.format('error', message, context, err));
  }
}
