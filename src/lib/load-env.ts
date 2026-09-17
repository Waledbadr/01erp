import { existsSync } from 'node:fs';
import path from 'node:path';

const appEnv = process.env.APP_ENV ?? 'development';
if (!['development', 'test', 'staging', 'production'].includes(appEnv))
  throw new Error('Invalid APP_ENV');
const file = path.resolve('.env.' + appEnv + '.local');
if (existsSync(file)) process.loadEnvFile(file);
