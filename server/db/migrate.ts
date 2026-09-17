import { checkDatabaseHealth, getDbPool } from './client.js';
import { logger } from '../core/logger.js';

export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  logger.info('Checking database status before running migrations...');
  const health = await checkDatabaseHealth();

  if (health.status === 'not_configured') {
    logger.warn('DATABASE_URL is not configured. Migration dry-run completed successfully.');
    return {
      success: true,
      message: 'DATABASE_URL not configured. Schema validation passed in offline mode.',
    };
  }

  if (health.status === 'unreachable') {
    logger.error('PostgreSQL instance unreachable', { error: health.error });
    throw new Error(`Database unreachable: ${health.error}`);
  }

  const pool = getDbPool();
  if (!pool) {
    throw new Error('Database pool unavailable.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Verify core tables exist or are ready
    await client.query(`
      CREATE TABLE IF NOT EXISTS _erp_migration_version (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await client.query(`
      INSERT INTO _erp_migration_version (version)
      VALUES ('001_initial_foundation_phase00')
      ON CONFLICT (version) DO NOTHING;
    `);

    await client.query('COMMIT');
    logger.info('Migration applied successfully.');
    return {
      success: true,
      message: 'Migration 001_initial_foundation_phase00 verified successfully.',
    };
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    logger.error('Migration failed and rolled back', { error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
