# Deployment & Infrastructure Guide — Saudi ERP

## 1. Cloud Run Container Environment

The Saudi ERP system runs as a unified production full-stack container on Google Cloud Run:
- **Port**: `3000` (Strict platform constraint; external traffic routes exclusively to port 3000).
- **Host**: `0.0.0.0`.
- **Process Model**: Express application serving both API endpoints under `/api/v1` and the React 19 single-page application from `dist/`.

---

## 2. Build and Start Sequence

### Build Pipeline:
```bash
npm run build
```
This single command executes:
1. `vite build`: Compiles the React SPA, Tailwind CSS v4 assets, and localized assets into `dist/`.
2. `esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs`: Bundles the backend server into a production CommonJS artifact with all external node modules preserved.

### Production Start:
```bash
npm run start
# Executes: node dist/server.cjs
```

---

## 3. Environment Variable Configuration

All environment variables must be declared in `.env.example`. Secrets are injected at runtime via Cloud Run environment secrets:

| Variable Name | Required | Description |
| :--- | :---: | :--- |
| `PORT` | Yes | Hardcoded to `3000` by container infrastructure. |
| `NODE_ENV` | Yes | Set to `production` in live environments. |
| `DATABASE_URL` | Yes | PostgreSQL connection string with SSL configuration. |
| `JWT_SECRET` | Yes | High-entropy secret for signing session tokens. |
| `ZATCA_ENV` | Yes | `SIMULATION` (sandbox) or `PRODUCTION`. |
| `GEMINI_API_KEY` | Optional | AI Assistant & OCR document processing key (server-side only). |

---

## 4. Health Checks & Observability
- **Health Check Endpoint**: `GET /api/health`
  - Verifies database connectivity, memory usage, and background job queue status.
  - Returns `200 OK` with JSON status payload.
- **Graceful Shutdown**: Listens for `SIGTERM` and `SIGINT`, drains in-flight HTTP requests, closes active database connection pools, and flushes audit logs before process termination.
