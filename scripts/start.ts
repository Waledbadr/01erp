import '../src/lib/load-env';
import { spawn } from 'node:child_process';
import { readEnv, requireDatabaseUrl } from '../src/lib/env';

const env = readEnv();
if (env.APP_ENV !== 'production' && env.APP_ENV !== 'staging')
  throw new Error('Production server requires APP_ENV=production or staging');
requireDatabaseUrl();
const bin = process.platform === 'win32' ? 'next.cmd' : 'next';
const child = spawn(bin, ['start'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
