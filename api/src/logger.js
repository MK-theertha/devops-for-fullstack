import pino from 'pino';

// JSON logs to stdout: Docker captures them, Alloy ships them to Loki.
// Pretty printing is a dev-only convenience.
export function createLogger(config) {
  return pino({
    level: config.logLevel,
    base: { service: 'api', env: config.nodeEnv, version: config.appVersion },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    transport: config.logPretty ? { target: 'pino-pretty' } : undefined,
  });
}
