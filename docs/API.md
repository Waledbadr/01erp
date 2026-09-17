# API

Phase 00 exposes `GET /api/health/live` and `GET /api/health/ready`. Both return JSON with a correlation ID and echo it in the `x-correlation-id` response header. Liveness returns 200 when the route runs. Readiness queries PostgreSQL and returns 200 for ready or 503 for unavailable. The client status card uses readiness rather than a static success label.

Business REST endpoints will be versioned under `/api/v1` in later phases. They require validated input, verified tenant context, server-side permissions, idempotency for financial writes, structured localized errors, and OpenAPI documentation. No business endpoint exists in Phase 00.
