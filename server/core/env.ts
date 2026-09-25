import dotenv from 'dotenv';
dotenv.config();

export interface AppEnv {
  PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  DATABASE_URL?: string;
  JWT_SECRET: string;
  APP_URL: string;
  ZATCA_ENV: 'sandbox' | 'simulation' | 'production';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  /** True when identity/company/session data is stored in PostgreSQL (DATABASE_URL set). */
  PERSISTENCE_ENABLED: boolean;
  /** Seed the in-memory demo company and demo users (with a published password). */
  SEED_DEMO_DATA: boolean;
}

export function validateEnv(): AppEnv {
  const port = 3000;

  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
  const appUrl = process.env.APP_URL || `http://localhost:${port}`;
  const zatcaEnv = (process.env.ZATCA_ENV || 'simulation') as 'sandbox' | 'simulation' | 'production';
  const logLevel = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';

  const dbUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;

  const jwtSecret =
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'dev-local-jwt-secret-min-32-chars-saudi-erp';

  // Persistence is on whenever a database is configured. Unit-test runs (NODE_ENV=test)
  // stay in memory unless ERP_PERSISTENCE=on is set explicitly; ERP_PERSISTENCE=off disables it.
  const persistenceFlag = (process.env.ERP_PERSISTENCE || '').toLowerCase();
  const persistenceEnabled =
    Boolean(dbUrl) && (persistenceFlag ? persistenceFlag === 'on' : nodeEnv !== 'test');

  // Demo accounts use a published password, so they are off by default once real data is stored.
  const seedFlag = (process.env.SEED_DEMO_DATA || '').toLowerCase();
  const seedDemoData = seedFlag ? seedFlag === 'true' : !persistenceEnabled;

  return {
    PORT: port,
    NODE_ENV: nodeEnv,
    DATABASE_URL: dbUrl,
    JWT_SECRET: jwtSecret,
    APP_URL: appUrl,
    ZATCA_ENV: zatcaEnv,
    LOG_LEVEL: logLevel,
    PERSISTENCE_ENABLED: persistenceEnabled,
    SEED_DEMO_DATA: seedDemoData,
  };
}

export const env = validateEnv();
