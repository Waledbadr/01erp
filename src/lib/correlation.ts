export function correlationId(request: Request): string {
  const given = request.headers.get('x-correlation-id');
  return given && /^[a-zA-Z0-9_-]{8,64}$/.test(given)
    ? given
    : crypto.randomUUID();
}
