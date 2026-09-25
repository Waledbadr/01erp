import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createExpressApp } from './server/app.js';
import { env } from './server/core/env.js';
import { logger } from './server/core/logger.js';

async function startServer() {
  const app = createExpressApp();
  const PORT = 3000;

  // Vite Integration (Development Middleware vs Production Static Serving)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind Server to Port 3000 & Host 0.0.0.0
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Saudi Enterprise ERP Server running on http://0.0.0.0:${PORT} [${env.NODE_ENV}]`);
  });
}

startServer().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
