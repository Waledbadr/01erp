import { describe, it, expect, afterEach } from 'vitest';
import { buildConnectionOptions } from '../../server/db/client.js';

const SUPABASE =
  'postgres://postgres.abc:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require&supa=base-pooler.x';

describe('buildConnectionOptions (hosted Postgres SSL)', () => {
  afterEach(() => {
    delete process.env.DATABASE_CA_CERT;
  });

  it('removes sslmode from the URL so pg does not force verify-full over our ssl option', () => {
    const o = buildConnectionOptions(SUPABASE);
    expect(o.connectionString).not.toMatch(/sslmode/);
    expect(o.connectionString).toContain('supa=base-pooler.x');
    expect(o.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('verifies the certificate when DATABASE_CA_CERT is provided', () => {
    process.env.DATABASE_CA_CERT = '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----';
    const o = buildConnectionOptions(SUPABASE);
    expect(o.ssl).toMatchObject({ rejectUnauthorized: true });
    expect((o.ssl as { ca: string }).ca).toContain('\nabc\n');
  });

  it('uses no SSL for a local database', () => {
    expect(buildConnectionOptions('postgresql://postgres@127.0.0.1:5432/x').ssl).toBe(false);
    expect(buildConnectionOptions('postgresql://postgres@localhost/x?sslmode=disable').ssl).toBe(false);
  });
});
