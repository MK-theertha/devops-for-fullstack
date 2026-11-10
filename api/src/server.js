import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';

const config = loadConfig();
const logger = createLogger(config);
const db = createPool(config, logger);
const app = createApp({ db, logger, config });

const server = app.listen(config.port, (err) => {
  if (err) {
    logger.fatal({ err }, 'failed to start');
    process.exit(1);
  }
  logger.info({ port: config.port }, 'api listening');
});

// `docker stop` sends SIGTERM and waits 10s before SIGKILL. Stop accepting
// connections, let in-flight requests finish, then close the pool.
function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 8_000).unref();

  server.close(async () => {
    await db.end();
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'unhandled promise rejection');
  process.exit(1);
});
