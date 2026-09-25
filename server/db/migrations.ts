/**
 * Versioned SQL migrations.
 *
 * Each migration runs once, inside a transaction, and is recorded in
 * `_erp_migration_version`. A PostgreSQL advisory lock serialises concurrent
 * runners (several serverless instances starting at the same time).
 *
 * Never edit a migration that has shipped. Add a new one instead.
 */
import type pg from 'pg';

export interface Migration {
  version: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: '001_initial_foundation_phase00',
    sql: `SELECT 1;`,
  },
  {
    // Unit 1: identity, companies and sessions.
    // Key columns are real columns (for lookups and constraints); the full
    // application object is kept in `data` so new fields do not need a migration.
    version: '002_identity_tenants_sessions',
    sql: `
      CREATE SEQUENCE IF NOT EXISTS tenant_code_seq START WITH 1001;

      CREATE TABLE IF NOT EXISTS tenants (
        id              TEXT PRIMARY KEY,
        code            TEXT NOT NULL UNIQUE,
        name_ar         TEXT NOT NULL,
        name_en         TEXT NOT NULL,
        vat_number      TEXT NOT NULL DEFAULT '',
        cr_number       TEXT NOT NULL DEFAULT '',
        is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
        data            JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS branches (
        id              TEXT PRIMARY KEY,
        tenant_id       TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        code            TEXT NOT NULL,
        is_main_branch  BOOLEAN NOT NULL DEFAULT FALSE,
        data            JSONB NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS branches_tenant_idx ON branches(tenant_id);

      CREATE TABLE IF NOT EXISTS users (
        id                       TEXT PRIMARY KEY,
        email                    TEXT NOT NULL UNIQUE,
        password_hash            TEXT NOT NULL,
        is_active                BOOLEAN NOT NULL DEFAULT TRUE,
        is_platform_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
        data                     JSONB NOT NULL,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT users_email_lowercase CHECK (email = LOWER(email))
      );

      CREATE TABLE IF NOT EXISTS tenant_memberships (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role_code   TEXT NOT NULL,
        branch_id   TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        data        JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_idx ON tenant_memberships(tenant_id);
      CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx ON tenant_memberships(user_id);

      -- Session tokens are never stored in clear text: token_hash = sha256(token).
      CREATE TABLE IF NOT EXISTS user_sessions (
        token_hash  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tenant_id   TEXT NOT NULL DEFAULT '',
        expires_at  TIMESTAMPTZ NOT NULL,
        data        JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
      CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS user_invites (
        id          TEXT PRIMARY KEY,
        tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email       TEXT NOT NULL,
        data        JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS user_invites_tenant_idx ON user_invites(tenant_id);

      -- Short-lived password-reset and MFA-challenge tokens (key_hash = sha256(key)).
      CREATE TABLE IF NOT EXISTS auth_tokens (
        key_hash    TEXT PRIMARY KEY,
        email       TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL
      );

      CREATE TABLE IF NOT EXISTS login_history (
        id          TEXT PRIMARY KEY,
        user_id     TEXT,
        email       TEXT NOT NULL,
        tenant_id   TEXT,
        status      TEXT NOT NULL,
        data        JSONB NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS login_history_user_idx ON login_history(user_id, created_at DESC);
    `,
  },
  {
    // Supabase (and similar hosts) expose the "public" schema through an HTTP API to the
    // "anon" and "authenticated" roles, whose keys are public by design. These tables must
    // never be reachable that way. RLS on with no policies = deny for those roles; the
    // application connects as the table owner, which RLS does not restrict.
    version: '003_lock_down_identity_tables',
    sql: `
      DO $$
      DECLARE
        t TEXT;
        r TEXT;
        erp_tables TEXT[] := ARRAY['_erp_migration_version','tenants','branches','users','tenant_memberships',
                                   'user_sessions','user_invites','auth_tokens','login_history'];
      BEGIN
        FOREACH t IN ARRAY erp_tables LOOP
          EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        END LOOP;
        FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            FOREACH t IN ARRAY erp_tables LOOP
              EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
            END LOOP;
            EXECUTE format('REVOKE ALL ON SEQUENCE tenant_code_seq FROM %I', r);
          END IF;
        END LOOP;
      END $$;
    `,
  },
  {
    // 003 closed the tables that existed then. Supabase also grants anon/authenticated
    // privileges on every FUTURE table and sequence through default privileges; revoke those
    // for objects created by the role running migrations, so new tables start closed too.
    version: '004_revoke_default_public_api_privileges',
    sql: `
      DO $$
      DECLARE r TEXT;
      BEGIN
        FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
            EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
          END IF;
        END LOOP;
      END $$;
    `,
  },
  {
    // TASK-008: one versioned snapshot of each company's operational data.
    version: '005_tenant_state',
    sql: `
      CREATE TABLE IF NOT EXISTS tenant_state (
        tenant_id   TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
        version     BIGINT NOT NULL DEFAULT 0,
        data        JSONB,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE tenant_state ENABLE ROW LEVEL SECURITY;
      DO $$
      DECLARE r TEXT;
      BEGIN
        FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON TABLE tenant_state FROM %I', r);
          END IF;
        END LOOP;
      END $$;
    `,
  },
];

const MIGRATION_LOCK_KEY = 482_917_001; // arbitrary, stable advisory-lock id

/** Applies all pending migrations. Returns the versions applied in this call. */
export async function applyMigrations(pool: pg.Pool): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS _erp_migration_version (
        version VARCHAR(64) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    const { rows } = await client.query<{ version: string }>('SELECT version FROM _erp_migration_version');
    const done = new Set(rows.map((r) => r.version));

    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('INSERT INTO _erp_migration_version (version) VALUES ($1)', [m.version]);
        await client.query('COMMIT');
        applied.push(m.version);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.version} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return applied;
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
