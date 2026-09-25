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

---

## 5. Vercel Deployment

For deploying to Vercel (Front-end SPA / Static Hosting):
1. **Repository**: Push/Export code to GitHub or GitLab.
2. **Framework Preset**: `Vite`
3. **Build Command**: `vite build`
4. **Output Directory**: `dist`
5. **Configuration**: Managed via `vercel.json` with SPA routing rewrite (`/*` -> `/index.html`).
6. **Environment Variables**: Set any public or client variables (`VITE_*`) in the Vercel Project Dashboard.


## Vercel native ESM startup regression (2026-09-25)

Vercel reported `ERR_MODULE_NOT_FOUND` for `src/lib/accounting` imported by `src/lib/treasury.js`. Relative runtime imports must include the emitted `.js` extension. Vite/esbuild bundling and TypeScript loaders can resolve extensionless imports and therefore hide this production failure.

Run `npm run test:api-esm` before deployment. It transpiles the API and shared server libraries into separate JavaScript files in a disposable project cache directory, then launches native Node without a TypeScript loader. It checks startup, HTTP health (200), invalid registration (400), and synthetic registration (201). No production database or external service is used. The check also runs in CI.

The extension fix must be deployed to Vercel before the live site changes. Local success does not claim a production redeployment. This fix does not change the existing in-memory registration storage.


## Identity persistence (TASK-006, 2026-09-25)

When `DATABASE_URL` (or `POSTGRES_URL*`) is set, users, companies, branches, memberships, sessions,
invites, auth tokens and login history are stored in PostgreSQL. Tables are created automatically on
the first API request; `npm run db:migrate` does the same explicitly and, when `PLATFORM_ADMIN_EMAIL`
and `PLATFORM_ADMIN_PASSWORD` (>= 12 characters) are set, creates or updates the platform super admin.

With a database the demo company and demo users (published password) are NOT seeded unless
`SEED_DEMO_DATA=true`. `ERP_PERSISTENCE=off` forces in-memory mode.

All other domain data is still in memory only and is lost on restart. Serverless hosting (Vercel) is
therefore still unsuitable for real use until the remaining units are persisted.

Before deploying: run `TEST_DATABASE_URL=<disposable db> npm run test:persistence`. The test DROPS the
`public` schema of that database; never point it at real data.
