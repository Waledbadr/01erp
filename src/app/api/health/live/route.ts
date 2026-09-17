import { correlationId } from '@/lib/correlation';

export function GET(request: Request): Response {
  const id = correlationId(request);
  return Response.json(
    { status: 'live', correlationId: id },
    { headers: { 'x-correlation-id': id } },
  );
}
