/**
 * The payment webhook is unauthenticated by design, so it must only act on requests
 * signed with BILLING_WEBHOOK_SECRET (hex HMAC-SHA256 of the raw body).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import type { Server } from 'node:http';
import { createExpressApp } from '../../server/app.js';

let server: Server;
let base = '';

beforeAll(async () => {
  const app = createExpressApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  delete process.env.BILLING_WEBHOOK_SECRET;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const body = JSON.stringify({ event: 'payment.succeeded', transactionId: 'tx-test-1', invoiceId: 'inv-x', tenantId: 't-x', amountSar: 100 });
const post = (headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1/billing/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });

describe('Billing webhook signature', () => {
  it('is disabled (503) when no secret is configured', async () => {
    delete process.env.BILLING_WEBHOOK_SECRET;
    expect((await post()).status).toBe(503);
  });

  it('rejects missing or wrong signatures (401)', async () => {
    process.env.BILLING_WEBHOOK_SECRET = 'test-secret-value';
    expect((await post()).status).toBe(401);
    expect((await post({ 'x-webhook-signature': 'deadbeef' })).status).toBe(401);
    const wrongKey = crypto.createHmac('sha256', 'other-secret').update(body).digest('hex');
    expect((await post({ 'x-webhook-signature': wrongKey })).status).toBe(401);
  });

  it('passes a correctly signed request to the billing service', async () => {
    process.env.BILLING_WEBHOOK_SECRET = 'test-secret-value';
    const sig = crypto.createHmac('sha256', 'test-secret-value').update(body).digest('hex');
    const res = await post({ 'x-webhook-signature': sig });
    expect([401, 503]).not.toContain(res.status);
  });
});
