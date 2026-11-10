import { randomUUID } from 'node:crypto';
import express from 'express';
import pinoHttp from 'pino-http';
import { metricsMiddleware, register, setBuildInfo } from './metrics.js';

const QUIET_PATHS = new Set(['/health', '/ready', '/metrics']);

export function createApp({ db, logger, config }) {
  setBuildInfo(config.appVersion);

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.use(
    pinoHttp({
      logger,
      // Reuse the ID nginx assigns so one request can be traced across services.
      genReqId: (req, res) => {
        const id = req.headers['x-request-id'] || randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url) },
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
    }),
  );
  app.use(metricsMiddleware);

  // Liveness: the process is up. Never touches dependencies.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: config.appVersion });
  });

  // Readiness: the process can serve traffic. Used to gate deploys.
  app.get('/ready', async (req, res) => {
    try {
      await db.query('SELECT 1');
      res.json({ status: 'ready' });
    } catch (err) {
      req.log.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.get('/api/notes', async (req, res) => {
    const { rows } = await db.query(
      'SELECT id, body, created_at FROM notes ORDER BY created_at DESC LIMIT 50',
    );
    res.json(rows);
  });

  app.post('/api/notes', async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body || body.length > 500) {
      return res.status(400).json({ error: 'body must be a non-empty string of at most 500 characters' });
    }
    const { rows } = await db.query(
      'INSERT INTO notes (body) VALUES ($1) RETURNING id, body, created_at',
      [body],
    );
    res.status(201).json(rows[0]);
  });

  app.use((req, res) => res.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    req.log.error({ err }, 'unhandled error');
    res.status(500).json({ error: 'internal error', requestId: req.id });
  });

  return app;
}
