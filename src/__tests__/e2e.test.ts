import { describe, it, expect } from 'vitest';
import { SYSTEM_DEFAULT_TAX_RATES, SYSTEM_DEFAULT_UNITS_OF_MEASURE, SYSTEM_DEFAULT_DOCUMENT_TYPES, SAUDI_STANDARD_CHART_OF_ACCOUNTS } from '../../server/db/seed-system.js';
import { validateEnv } from '../../server/core/env.js';
import { StructuredLogger } from '../../server/core/logger.js';

describe('Phase 00 Foundation & Scaffold Verification', () => {
  it('validates environment boot parameters', () => {
    const env = validateEnv();
    expect(env.PORT).toBeGreaterThan(0);
    expect(['development', 'production', 'test']).toContain(env.NODE_ENV);
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it('verifies structured logging redacts sensitive tokens and secrets', () => {
    let capturedLog = '';
    const originalLog = console.log;
    console.log = (msg: string) => {
      capturedLog = msg;
    };

    try {
      const logger = new StructuredLogger('test-corr-id');
      logger.info('User authenticated', {
        email: 'user@company.sa',
        password: 'PlainTextPassword123!',
        token: 'secret-jwt-token-value',
        privateKey: 'BEGIN-RSA-PRIVATE-KEY',
      });

      const parsed = JSON.parse(capturedLog);
      expect(parsed.correlationId).toBe('test-corr-id');
      expect(parsed.email).toBe('user@company.sa');
      expect(parsed.password).toBe('[REDACTED]');
      expect(parsed.token).toBe('[REDACTED]');
      expect(parsed.privateKey).toBe('[REDACTED]');
    } finally {
      console.log = originalLog;
    }
  });

  it('verifies system default tax rates contain mandatory 15% standard rate', () => {
    const standardVat = SYSTEM_DEFAULT_TAX_RATES.find((t) => t.code === 'VAT_15');
    expect(standardVat).toBeDefined();
    expect(standardVat?.ratePercentage).toBe(15);
    expect(standardVat?.taxCategoryCode).toBe('S');
  });

  it('verifies system default units include standard piece, carton, and weight units', () => {
    const unitCodes = SYSTEM_DEFAULT_UNITS_OF_MEASURE.map((u) => u.code);
    expect(unitCodes).toContain('PCE');
    expect(unitCodes).toContain('CT');
    expect(unitCodes).toContain('KGM');
  });

  it('verifies system default document types include ZATCA Standard and Simplified invoices', () => {
    const docCodes = SYSTEM_DEFAULT_DOCUMENT_TYPES.map((d) => d.code);
    expect(docCodes).toContain('STD_INV');
    expect(docCodes).toContain('SMP_INV');
    expect(docCodes).toContain('CR_NOTE');
  });

  it('verifies Saudi Unified Chart of Accounts has all 5 fundamental accounting groups', () => {
    const types = new Set(SAUDI_STANDARD_CHART_OF_ACCOUNTS.map((a) => a.type));
    expect(types.has('ASSET')).toBe(true);
    expect(types.has('LIABILITY')).toBe(true);
    expect(types.has('EQUITY')).toBe(true);
    expect(types.has('REVENUE')).toBe(true);
    expect(types.has('EXPENSE')).toBe(true);
  });
});
