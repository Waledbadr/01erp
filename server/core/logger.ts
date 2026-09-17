import crypto from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = new Set([
  'password',
  'secret',
  'token',
  'jwt',
  'privatekey',
  'apikey',
  'authorization',
  'cookie',
  'cvv',
  'csid',
]);

function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSensitive);
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('privatekey')) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  module?: string;
  action?: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  private correlationId: string;
  private defaultContext: LogContext;

  constructor(correlationId?: string, defaultContext: LogContext = {}) {
    this.correlationId = correlationId || crypto.randomUUID();
    this.defaultContext = defaultContext;
  }

  public setCorrelationId(id: string) {
    this.correlationId = id;
  }

  public getCorrelationId(): string {
    return this.correlationId;
  }

  private writeLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      correlationId: this.correlationId,
      ...this.defaultContext,
      ...(meta ? (redactSensitive(meta) as Record<string, unknown>) : {}),
    };

    const serialized = JSON.stringify(payload);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  }

  public debug(message: string, meta?: Record<string, unknown>) {
    this.writeLog('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>) {
    this.writeLog('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>) {
    this.writeLog('warn', message, meta);
  }

  public error(message: string, meta?: Record<string, unknown>) {
    this.writeLog('error', message, meta);
  }
}

export const logger = new StructuredLogger();
