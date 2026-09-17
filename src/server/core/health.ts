import { getPool } from '@/db/client';

export async function databaseReady(): Promise<boolean> {
  try {
    const result = await getPool().query('select 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch {
    return false;
  }
}
