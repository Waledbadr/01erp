/**
 * Minimal API process used by integration tests (no Vite, no static files).
 * Usage: PORT=4101 DATABASE_URL=... tsx scripts/test-api-server.ts
 */
import { createExpressApp } from '../server/app.js';

const port = Number(process.env.TEST_API_PORT || process.env.PORT || 4100);
const app = createExpressApp();
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`TEST_API_READY ${port}`);
});

const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
