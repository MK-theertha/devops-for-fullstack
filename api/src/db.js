import pg from 'pg';

export function createPool(config, logger) {
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  // An idle client erroring (e.g. DB restart) must not crash the process.
  pool.on('error', (err) => logger.error({ err }, 'idle database client error'));
  return pool;
}
