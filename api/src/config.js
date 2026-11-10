import fs from 'node:fs';

// Reads KEY, or the file at KEY_FILE (Docker/Kubernetes secrets convention).
function read(env, key) {
  const file = env[`${key}_FILE`];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return env[key];
}

const REQUIRED = ['DATABASE_URL'];

// Validate config once at startup so a misconfigured container fails fast
// (and loudly) instead of erroring on the first request.
export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter((key) => !read(env, key));
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a positive integer, got "${env.PORT}"`);
  }

  return Object.freeze({
    nodeEnv: env.NODE_ENV ?? 'development',
    port,
    databaseUrl: read(env, 'DATABASE_URL'),
    logLevel: env.LOG_LEVEL ?? 'info',
    logPretty: env.LOG_PRETTY === 'true',
    appVersion: env.APP_VERSION ?? 'dev',
  });
}
