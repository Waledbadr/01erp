/**
 * Every module must take the company from the signed-in session, never from a header
 * (`x-tenant-id`), a query/body `tenantId`, or a shared default such as 'tenant-default'.
 *
 * Runs the real Express app in-process with two freshly registered companies (A and B).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createExpressApp } from '../../server/app.js';

let server: Server;
let base = '';

interface Company {
  token: string;
  tenantId: string;
}

async function call(method: string, url: string, body?: unknown, token?: string, extra: Record<string, string> = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  return { status: res.status, body: json, text };
}

async function register(tag: string): Promise<Company> {
  const res = await call('POST', '/api/v1/auth/register', {
    companyNameAr: `شركة عزل ${tag}`,
    adminFullName: `Owner ${tag}`,
    adminEmail: `owner-${tag}-${Date.now()}@isolation-test.sa`,
    password: 'Isolation-Test-2026',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { token: res.body.token, tenantId: res.body.tenant.id };
}

let A: Company;
let B: Company;

beforeAll(async () => {
  const app = createExpressApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  A = await register('a');
  B = await register('b');
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Module routes take the company from the session only', () => {
  it('reject unauthenticated requests even when a company is named in a header or query (401)', async () => {
    const hdr = { 'x-tenant-id': A.tenantId };
    const q = `tenantId=${encodeURIComponent(A.tenantId)}`;
    const targets: Array<[string, string, unknown?]> = [
      ['GET', `/api/v1/reports/hub?${q}`],
      ['GET', `/api/v1/reports/presets?${q}`],
      ['GET', `/api/v1/reports/execute/trial_balance?${q}`],
      ['GET', '/api/v1/assistant/conversations'],
      ['POST', '/api/v1/assistant/conversations', {}],
      ['GET', '/api/v1/automation/rules'],
      ['GET', '/api/v1/notifications'],
      ['GET', '/api/v1/notifications/reminders/due-invoices'],
      ['GET', `/api/v1/pos/registers?${q}`],
      ['GET', `/api/v1/pos/orders?${q}`],
      ['GET', '/api/v1/ocr/jobs'],
      ['GET', '/api/v1/documents/templates'],
      ['GET', '/api/v1/documents/share/secure-links'],
      ['GET', '/api/v1/import-export/jobs'],
      ['POST', '/api/v1/import-export/export', { resource: 'customers' }],
    ];
    for (const [method, url, body] of targets) {
      const res = await call(method, url, body, undefined, hdr);
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it('automation rules are per company', async () => {
    const created = await call('POST', '/api/v1/automation/rules', { nameEn: 'A-RULE-MARKER', nameAr: 'قاعدة أ' }, A.token);
    expect(created.status).toBe(201);
    expect((await call('GET', '/api/v1/automation/rules', undefined, A.token)).text).toContain('A-RULE-MARKER');
    expect((await call('GET', '/api/v1/automation/rules', undefined, B.token)).text).not.toContain('A-RULE-MARKER');
    expect(
      (await call('GET', '/api/v1/automation/rules', undefined, B.token, { 'x-tenant-id': A.tenantId })).text,
    ).not.toContain('A-RULE-MARKER');
  });

  it('assistant conversations are per company and ignore x-tenant-id', async () => {
    const created = await call('POST', '/api/v1/assistant/conversations', { titleEn: 'A-CHAT-MARKER' }, A.token);
    expect(created.status).toBeLessThan(300);
    expect((await call('GET', '/api/v1/assistant/conversations', undefined, A.token)).text).toContain('A-CHAT-MARKER');
    expect(
      (await call('GET', '/api/v1/assistant/conversations', undefined, B.token, { 'x-tenant-id': A.tenantId })).text,
    ).not.toContain('A-CHAT-MARKER');
  });

  it('notifications are per company', async () => {
    const created = await call(
      'POST',
      '/api/v1/notifications/trigger-test-event',
      { type: 'invoice_posted', metadata: { invoiceNumber: 'A-NOTIF-MARKER' } },
      A.token,
    );
    expect(created.status).toBeLessThan(300);
    expect((await call('GET', '/api/v1/notifications', undefined, A.token)).text).toContain('A-NOTIF-MARKER');
    expect((await call('GET', '/api/v1/notifications', undefined, B.token)).text).not.toContain('A-NOTIF-MARKER');
    expect(
      (await call('GET', '/api/v1/notifications', undefined, B.token, { 'x-tenant-id': A.tenantId })).text,
    ).not.toContain('A-NOTIF-MARKER');
  });

  it('POS shifts are per company and ignore tenantId in query/body', async () => {
    const regs = await call('GET', `/api/v1/pos/registers?tenantId=${A.tenantId}`, undefined, A.token);
    expect(regs.status).toBe(200);
    const registerId = regs.body.registers[0].id;
    const opened = await call(
      'POST',
      '/api/v1/pos/shifts/open',
      { registerId, cashierId: 'cashier-a', cashierName: 'A-CASHIER', openingFloatSar: 100, tenantId: B.tenantId },
      A.token,
    );
    expect(opened.status, JSON.stringify(opened.body)).toBeLessThan(300);
    const mine = await call('GET', `/api/v1/pos/shifts/active/${registerId}`, undefined, A.token);
    expect(mine.body.hasActiveShift).toBe(true);
    const other = await call('GET', `/api/v1/pos/shifts/active/${registerId}?tenantId=${A.tenantId}`, undefined, B.token);
    expect(other.body.hasActiveShift).toBe(false);
  });

  it('import/export ignores x-tenant-id', async () => {
    const cust = await call('POST', '/api/v1/sales/customers', { nameAr: 'عميل الشركة أ', nameEn: 'A-CUSTOMER-MARKER', mobile: '+966500000777', type: 'INDIVIDUAL' }, A.token);
    expect(cust.status).toBe(201);
    const own = await call('POST', '/api/v1/import-export/export', { resource: 'customers', format: 'CSV' }, A.token);
    expect(own.status).toBe(200);
    expect(own.text).toContain('A-CUSTOMER-MARKER');
    const other = await call('POST', '/api/v1/import-export/export', { resource: 'customers', format: 'CSV' }, B.token, { 'x-tenant-id': A.tenantId });
    expect(other.status).toBe(200);
    expect(other.text).not.toContain('A-CUSTOMER-MARKER');
  });

  it('public document links still open without login; login-only links require the owning company', async () => {
    const pub = await call(
      'POST',
      '/api/v1/documents/share/secure-link',
      { documentType: 'SALES_INVOICE', documentId: 'doc-a-1', documentNumber: 'A-DOC-1', allowNoLogin: true },
      A.token,
    );
    expect(pub.status).toBe(201);
    expect((await call('GET', `/api/v1/documents/share/secure-link/${pub.body.link.token}`)).status).toBe(200);

    const priv = await call(
      'POST',
      '/api/v1/documents/share/secure-link',
      { documentType: 'SALES_INVOICE', documentId: 'doc-a-2', documentNumber: 'A-DOC-2', allowNoLogin: false },
      A.token,
    );
    expect(priv.status).toBe(201);
    const t = priv.body.link.token;
    expect((await call('GET', `/api/v1/documents/share/secure-link/${t}`)).status).toBe(401);
    expect((await call('GET', `/api/v1/documents/share/secure-link/${t}`, undefined, B.token)).status).toBe(401);
    expect((await call('GET', `/api/v1/documents/share/secure-link/${t}`, undefined, A.token)).status).toBe(200);

    expect((await call('GET', '/api/v1/documents/share/secure-links', undefined, B.token, { 'x-tenant-id': A.tenantId })).text).not.toContain(
      'A-DOC-',
    );
  });
});
