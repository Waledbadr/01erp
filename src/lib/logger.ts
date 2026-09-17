type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null>;

const allowed = new Set([
  'correlationId',
  'companyId',
  'route',
  'durationMs',
  'status',
  'errorId',
]);

export function log(level: Level, event: string, fields: Fields = {}): void {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([key]) => allowed.has(key)),
  );
  const record = { time: new Date().toISOString(), level, event, ...safe };
  const output = JSON.stringify(record);
  if (level === 'error') console.error(output);
  else console.log(output);
}
