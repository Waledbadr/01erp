import crypto from 'crypto';
import { checkDatabaseHealth, getDbPool } from './client.js';
import { applyMigrations } from './migrations.js';
import { hashPassword } from '../core/security.js';
import { logger } from '../core/logger.js';

export async function runMigrations(): Promise<{ success: boolean; message: string }> {
  logger.info('Checking database status before running migrations...');
  const health = await checkDatabaseHealth();

  if (health.status === 'not_configured') {
    logger.warn('DATABASE_URL is not configured. Nothing to migrate.');
    return {
      success: false,
      message: 'DATABASE_URL is not configured. No migration was applied.',
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

  const applied = await applyMigrations(pool);
  const admin = await bootstrapPlatformAdmin();
  const message =
    (applied.length ? `Applied migrations: ${applied.join(', ')}.` : 'Database schema already up to date.') +
    (admin ? ` ${admin}` : '');
  logger.info(message);
  return { success: true, message };
}

/**
 * Creates (or updates the password of) the platform super admin from
 * PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD. Nothing happens when they are unset.
 * This replaces the hard-coded demo super admin, which is not seeded when a database is used.
 */
async function bootstrapPlatformAdmin(): Promise<string | null> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) return null;
  if (password.length < 12) {
    throw new Error('PLATFORM_ADMIN_PASSWORD must be at least 12 characters.');
  }
  const pool = getDbPool()!;
  const passwordHash = hashPassword(password);
  const existing = await pool.query<{ id: string; data: Record<string, unknown> }>(
    'SELECT id, data FROM users WHERE email = $1',
    [email],
  );
  if (existing.rows.length) {
    const data = { ...existing.rows[0].data, passwordHash, isPlatformSuperAdmin: true, isActive: true };
    await pool.query(
      `UPDATE users SET password_hash = $2, is_platform_super_admin = TRUE, is_active = TRUE, data = $3, updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, passwordHash, JSON.stringify(data)],
    );
    return `Platform admin ${email} updated.`;
  }
  const id = crypto.randomUUID();
  const user = {
    id,
    email,
    passwordHash,
    fullNameAr: 'مدير المنصة',
    fullNameEn: 'Platform Administrator',
    isPlatformSuperAdmin: true,
    isActive: true,
    mfaEnabled: false,
    failedLoginAttempts: 0,
    createdAt: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO users (id, email, password_hash, is_active, is_platform_super_admin, data)
     VALUES ($1, $2, $3, TRUE, TRUE, $4)`,
    [id, email, passwordHash, JSON.stringify(user)],
  );
  return `Platform admin ${email} created.`;
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
      process.exit(res.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
