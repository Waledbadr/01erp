import { createExpressApp } from '../server/app.js';

const app = createExpressApp();

export default function handler(req: any, res: any) {
  // Ensure req.url preserves the full /api path if rewritten
  if (req.url && !req.url.startsWith('/api') && req.originalUrl?.startsWith('/api')) {
    req.url = req.originalUrl;
  }
  return app(req, res);
}
