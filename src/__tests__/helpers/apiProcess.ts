/**
 * Starts the API as a separate Node process against TEST_DATABASE_URL, so tests can kill it
 * (SIGKILL) and start fresh processes to prove data survives restarts and stays consistent
 * across concurrently running instances.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export interface ApiProcess {
  base: string;
  proc: ChildProcess;
}

const ROOT = path.resolve(__dirname, '../../..');
let nextPort = 4700 + Math.floor(Math.random() * 800);

export async function startApi(databaseUrl: string): Promise<ApiProcess> {
  const port = nextPort++;
  const proc = spawn(process.execPath, ['--import', 'tsx', 'scripts/test-api-server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      POSTGRES_URL: '',
      POSTGRES_URL_NON_POOLING: '',
      POSTGRES_PRISMA_URL: '',
      TURNSTILE_SECRET_KEY: '',
      NODE_ENV: 'test',
      ERP_PERSISTENCE: 'on',
      SEED_DEMO_DATA: '',
      TEST_API_PORT: String(port),
      DOTENV_CONFIG_QUIET: 'true',
      LOG_LEVEL: 'error',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`API did not start:\n${output}`)), 60_000);
    proc.stdout!.on('data', (d: Buffer) => {
      output += d.toString();
      if (output.includes('TEST_API_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr!.on('data', (d: Buffer) => (output += d.toString()));
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`API exited early (${code}):\n${output}`));
    });
  });
  proc.removeAllListeners('exit');
  return { base: `http://127.0.0.1:${port}`, proc };
}

export async function stopApi(api: ApiProcess | undefined): Promise<void> {
  if (!api || api.proc.exitCode !== null || api.proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    api.proc.once('exit', () => resolve());
    api.proc.kill('SIGKILL');
  });
}

export async function call(
  api: ApiProcess,
  method: string,
  url: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(api.base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

/**
 * Creates (or recreates) a dedicated database for one test file, next to the database named in
 * TEST_DATABASE_URL, and returns its URL. Test files run in parallel, so they must never share
 * (and wipe) the same database.
 */
export async function prepareTestDatabase(baseUrl: string, suffix: string): Promise<string> {
  const { default: pg } = await import('pg');
  const url = new URL(baseUrl);
  const name = `${url.pathname.replace(/^\//, '') || 'postgres'}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, '_');
  const admin = new pg.Client({ connectionString: baseUrl });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  url.pathname = `/${name}`;
  return url.toString();
}
