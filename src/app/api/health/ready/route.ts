import { databaseReady } from '@/server/core/health';
import { correlationId } from '@/lib/correlation';

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const id = correlationId(request);
  const ready = await databaseReady();
  return Response.json(
    { status: ready ? 'ready' : 'unavailable', correlationId: id },
    { status: ready ? 200 : 503, headers: { 'x-correlation-id': id } },
  );
}
