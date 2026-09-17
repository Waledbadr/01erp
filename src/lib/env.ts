import { z } from 'zod';

const schema = z.object({
  APP_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  DATABASE_URL: z.url().startsWith('postgresql://').optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppEnv = z.infer<typeof schema>;

export function readEnv(
  source: Record<string, string | undefined> = process.env,
): AppEnv {
  return schema.parse(source);
}

export function requireDatabaseUrl(
  source: Record<string, string | undefined> = process.env,
): string {
  const url = readEnv(source).DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required for database operations');
  return url;
}
