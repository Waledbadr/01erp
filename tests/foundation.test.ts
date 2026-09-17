import { describe, expect, it } from 'vitest';
import { readEnv, requireDatabaseUrl } from '../src/lib/env';
import { correlationId } from '../src/lib/correlation';
import { log } from '../src/lib/logger';
import { vi } from 'vitest';

describe('foundation', () => {
  it('defaults to development while keeping database optional for static pages', () => {
    expect(readEnv({})).toEqual({ APP_ENV: 'development', LOG_LEVEL: 'info' });
  });
  it('fails fast when a database operation has no connection URL', () => {
    expect(() => requireDatabaseUrl({})).toThrow('DATABASE_URL is required');
  });
  it('rejects invalid deployment environment', () => {
    expect(() => readEnv({ APP_ENV: 'other' })).toThrow();
  });
  it('does not put arbitrary fields into structured logs', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('info', 'test.event', {
      correlationId: 'request_1234',
      password: 'sensitive',
      message: 'sensitive',
    });
    const record = JSON.parse(spy.mock.calls[0][0]);
    expect(record.correlationId).toBe('request_1234');
    expect(JSON.stringify(record)).not.toContain('sensitive');
    spy.mockRestore();
  });
  it('preserves a safe correlation id and replaces malformed input', () => {
    expect(
      correlationId(
        new Request('http://example.test', {
          headers: { 'x-correlation-id': 'request_1234' },
        }),
      ),
    ).toBe('request_1234');
    expect(
      correlationId(
        new Request('http://example.test', {
          headers: { 'x-correlation-id': 'bad value' },
        }),
      ),
    ).toMatch(/^[0-9a-f-]{36}$/);
  });
});
