// Applies migrations/*.sql in filename order, each in its own transaction.
// Runs as a one-shot container before the API starts (see docker-compose.yml).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createLogger } from './logger.js';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
// Arbitrary constant: serialises concurrent migrators (e.g. two replicas starting).
const LOCK_ID = 727274;

const config = loadConfig();
const logger = createLogger(config).child({ component: 'migrate' });
const pool = createPool(config, logger);
const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const { rows } = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  for (const file of pending) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      logger.info({ migration: file }, 'applied migration');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${err.message}`, { cause: err });
    }
  }

  logger.info({ applied: pending.length, total: files.length }, 'migrations complete');
} catch (err) {
  logger.fatal({ err }, 'migration failed');
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
  client.release();
  await pool.end();
}
