import client from 'prom-client';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const appInfo = new client.Gauge({
  name: 'app_info',
  help: 'Build information; value is always 1',
  labelNames: ['version'],
  registers: [register],
});

export function setBuildInfo(version) {
  appInfo.set({ version }, 1);
}

export function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    // Label by route template, not raw URL, to keep cardinality bounded.
    const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
    end({ method: req.method, route, status_code: res.statusCode });
  });
  next();
}
