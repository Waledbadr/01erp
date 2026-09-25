/**
 * TASK-008 acceptance: a company's operational data (items, stock, customers, invoices,
 * journals …) is stored in PostgreSQL, survives hard restarts, stays consistent between two
 * running processes, and a failed request leaves no partial changes.
 *
 * Needs TEST_DATABASE_URL (a DISPOSABLE database: its public schema is dropped).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { startApi, stopApi, call, type ApiProcess } from './helpers/apiProcess.js';

const DB_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!DB_URL)('Company data persistence on PostgreSQL', () => {
  let pool: pg.Pool;
  const running: ApiProcess[] = [];
  const start = async () => {
    const api = await startApi(DB_URL!);
    running.push(api);
    return api;
  };
  const stockOf = async (api: ApiProcess, token: string) => {
    const r = await call(api, 'GET', '/api/v1/inventory/stocks', undefined, token);
    const rows = r.body.stocks ?? r.body;
    return rows.reduce((s: number, x: any) => s + Number(x.currentStockBaseQty || 0), 0);
  };

  let token = '';
  let itemId = '';
  let customerId = '';
  let warehouseId = '';
  let invoiceNumber = '';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DB_URL });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }, 60_000);

  afterAll(async () => {
    await Promise.all(running.map(stopApi));
    await pool?.end();
  });

  it('records a full sale on process A: item, customer, opening stock, posted invoice', async () => {
    const a = await start();
    const reg = await call(a, 'POST', '/api/v1/auth/register', {
      companyNameAr: 'شركة بيانات حقيقية',
      adminFullName: 'مالك',
      adminEmail: 'owner@company-data.sa',
      password: 'Owner-Pass-2026',
    });
    expect(reg.status).toBe(201);
    token = reg.body.token;

    const item = await call(a, 'POST', '/api/v1/inventory/items', {
      nameAr: 'قهوة عربية', nameEn: 'Arabic coffee', sku: 'COF-1', baseUnit: 'PCE', sellingPrice: 100, cost: 60, type: 'INVENTORY',
    }, token);
    expect(item.status).toBeLessThan(300);
    itemId = item.body.item.id;

    const cust = await call(a, 'POST', '/api/v1/sales/customers', { nameAr: 'عميل نقدي', mobile: '+966500000001', type: 'INDIVIDUAL' }, token);
    expect(cust.status).toBe(201);
    customerId = cust.body.id;

    const wh = await call(a, 'GET', '/api/v1/inventory/warehouses', undefined, token);
    warehouseId = (wh.body.warehouses ?? wh.body)[0].id;

    const opening = await call(a, 'POST', '/api/v1/inventory/opening-stock', {
      entryDate: '2026-09-01', items: [{ itemId, warehouseId, quantity: 50, unitCostSar: 60 }],
    }, token);
    expect(opening.status).toBe(201);

    const inv = await call(a, 'POST', '/api/v1/sales/invoices', {
      customerId, invoiceType: 'SIMPLIFIED_B2C', paymentMethod: 'CASH',
      lines: [{ itemId, quantity: 2, unitPriceSar: 100, taxRate: 15 }],
    }, token);
    expect(inv.status).toBe(201);
    const posted = await call(a, 'POST', `/api/v1/sales/invoices/${inv.body.id}/post`, {}, token);
    expect(posted.status).toBeLessThan(300);
    invoiceNumber = inv.body.invoiceNumber;
    expect(await stockOf(a, token)).toBe(48);
    await stopApi(a);
  }, 120_000);

  it('after a hard restart (process B) everything is still there and the ledger balances', async () => {
    const b = await start();
    const items = await call(b, 'GET', '/api/v1/inventory/items', undefined, token);
    expect(items.body.items.map((i: any) => i.sku)).toContain('COF-1');
    const customers = await call(b, 'GET', '/api/v1/sales/customers', undefined, token);
    expect(customers.body.customers.map((c: any) => c.id)).toContain(customerId);
    const invoices = await call(b, 'GET', '/api/v1/sales/invoices', undefined, token);
    const inv = invoices.body.find((i: any) => i.invoiceNumber === invoiceNumber);
    expect(inv.status).toBe('POSTED');
    expect(inv.totalAmountSar).toBe(230);
    expect(await stockOf(b, token)).toBe(48);
    const journals = await call(b, 'GET', '/api/v1/accounting/journals', undefined, token);
    expect(journals.body.journals.length).toBeGreaterThanOrEqual(2);
    const tb = await call(b, 'GET', '/api/v1/accounting/trial-balance', undefined, token);
    const report = tb.body.report ?? tb.body;
    expect(report.isBalanced).toBe(true);
    await stopApi(b);
  }, 120_000);

  it('a failed request leaves no partial change, in the same process and after restart', async () => {
    const a = await start();
    // unitCostSar missing -> the service adds stock then fails converting NaN to BigInt.
    const bad = await call(a, 'POST', '/api/v1/inventory/opening-stock', {
      entryDate: '2026-09-02', items: [{ itemId, warehouseId, quantity: 50, unitCost: 60 }],
    }, token);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(await stockOf(a, token)).toBe(48);
    await stopApi(a);
    const b = await start();
    expect(await stockOf(b, token)).toBe(48);
    await stopApi(b);
  }, 120_000);

  it('two running processes stay consistent under concurrent writes to the same company', async () => {
    const a = await start();
    const b = await start();
    const writes = Array.from({ length: 10 }, (_, i) =>
      call(i % 2 ? a : b, 'POST', '/api/v1/sales/customers', { nameAr: `عميل متزامن ${i}`, mobile: `+9665000001${String(i).padStart(2, '0')}`, type: 'INDIVIDUAL' }, token),
    );
    const results = await Promise.all(writes);
    expect(results.every((r) => r.status === 201)).toBe(true);
    for (const api of [a, b]) {
      const list = await call(api, 'GET', '/api/v1/sales/customers', undefined, token);
      const names = list.body.customers.map((c: any) => c.nameAr).filter((n: string) => n.startsWith('عميل متزامن'));
      expect(names).toHaveLength(10);
      const codes = list.body.customers.map((c: any) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
    await stopApi(a);
    await stopApi(b);
  }, 180_000);

  it('a burst of 25 parallel requests for one company does not exhaust the connection pool', async () => {
    const a = await start();
    const started = Date.now();
    const urls = ['/api/v1/inventory/items', '/api/v1/sales/invoices', '/api/v1/sales/customers', '/api/v1/accounting/accounts', '/api/v1/treasury/overview'];
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) => call(a, 'GET', urls[i % urls.length], undefined, token)));
    expect(results.map((r) => r.status).every((s) => s === 200)).toBe(true);
    expect(Date.now() - started).toBeLessThan(15_000);
    await stopApi(a);
  }, 120_000);

  it('a second company sees none of the first company\'s data and starts without demo data', async () => {
    const a = await start();
    const reg = await call(a, 'POST', '/api/v1/auth/register', {
      companyNameAr: 'شركة ثانية', adminFullName: 'مالك ٢', adminEmail: 'owner2@company-data.sa', password: 'Owner2-Pass-2026',
    });
    const t2 = reg.body.token;
    expect((await call(a, 'GET', '/api/v1/inventory/items', undefined, t2)).body.items).toHaveLength(0);
    expect((await call(a, 'GET', '/api/v1/sales/invoices', undefined, t2)).body).toHaveLength(0);
    const assets = await call(a, 'GET', '/api/v1/assets', undefined, t2);
    const assetRows = assets.body.assets ?? assets.body.data ?? assets.body;
    expect(Array.isArray(assetRows) ? assetRows.length : 0).toBe(0);
    await stopApi(a);
  }, 120_000);

  it('stores one snapshot row per company, closed to the public API roles', async () => {
    const rows = await pool.query('SELECT tenant_id, version FROM tenant_state WHERE data IS NOT NULL');
    expect(rows.rows.length).toBe(2);
    const rls = await pool.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'tenant_state'`);
    expect(rls.rows[0].relrowsecurity).toBe(true);
  });
});
