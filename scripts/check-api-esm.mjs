import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Transpile without bundling or a TS loader: native Node must resolve every import.
const root = fileURLToPath(new URL('../', import.meta.url));
const cache = path.join(root, 'node_modules', '.cache');
await mkdir(cache, { recursive: true });
const output = await mkdtemp(path.join(cache, 'api-esm-'));

async function transpileDirectory(relative) {
  for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      await transpileDirectory(name);
    } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
      const source = await readFile(path.join(root, name), 'utf8');
      const result = ts.transpileModule(source, {
        fileName: name,
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      const destination = path.join(output, name.replace(/\.ts$/, '.js'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, result.outputText);
    }
  }
}

try {
  await writeFile(path.join(output, 'package.json'), '{"type":"module"}');
  for (const directory of ['api', 'server', 'src/lib', 'src/utils']) await transpileDirectory(directory);
  await writeFile(path.join(output, 'check.mjs'), `
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
// No real database, CAPTCHA, or AI provider may be used by this smoke test.
for (const key of ['DATABASE_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_URL',
  'POSTGRES_PRISMA_URL', 'TURNSTILE_SECRET_KEY', 'GEMINI_API_KEY']) process.env[key] = '';
process.env.NODE_ENV = 'test';
process.env.DOTENV_CONFIG_QUIET = 'true';
console.log = () => {};
const { default: handler } = await import('./api/index.js');
const server = createServer(handler);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
try {
  const health = await fetch(base + '/api/health/live');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, 'ok');
  const invalid = await fetch(base + '/api/v1/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  assert.equal(invalid.status, 400);
  const registration = await fetch(base + '/api/v1/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyNameAr: 'Synthetic ESM test', adminFullName: 'Test User',
      adminEmail: 'esm-smoke@example.invalid', password: 'Synthetic-test-only-2026' }),
  });
  assert.equal(registration.status, 201);
  const body = await registration.json();
  assert.ok(body.tenant.id);
  assert.ok(body.user.id);
  process.stdout.write('Native ESM: startup, health, validation, registration PASS\\n');
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
`);
  const result = spawnSync(process.execPath, [path.join(output, 'check.mjs')], {
    cwd: output, encoding: 'utf8', timeout: 60000,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Native ESM API smoke test failed');
} finally {
  // mkdtemp creates this disposable directory under the project's cache only.
  assert.ok(output.startsWith(cache + path.sep));
  await rm(output, { recursive: true, force: true });
}
