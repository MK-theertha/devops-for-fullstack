# Runbook

## Signals

| Signal | Source | Where to look |
|---|---|---|
| Metrics | API `/metrics` (request histogram by route and status, Node runtime, `app_info{version}`), scraped every 15s; DNS discovery picks up every replica | Grafana → Notes → **Notes API**, or Prometheus :9090 |
| Logs | JSON on stdout from the API (pino), nginx, and Caddy → Alloy → Loki, labelled `service` and `level` | Grafana → Explore → Loki: `{service="api", level="error"}` |
| Tracing a request | nginx assigns `X-Request-ID` and the API logs it as `reqId`. 500 responses return it as `requestId` and the UI shows it as "ref …" | `{project="notes"} \|= "<request id>"` |
| Health | `/health` (liveness), `/ready` (checks the DB; used to gate deploys) | `docker compose ps` |

Alert rules are in `monitoring/prometheus/alerts.yml`. Firing alerts appear in Prometheus → Alerts.

## ApiDown
No API replica is being scraped.
1. Run `docker compose ps api` and `docker compose logs --tail 100 api`.
2. A config error at startup means a bad `.env`; check the "Missing required environment variables" message.
3. If the trouble began with a deploy, roll back: `scripts/deploy.sh --rollback`.

## ApiHighErrorRate
More than 5% of requests return 5xx.
1. Run `{service="api", level="error"}` in Loki and group by `msg`.
2. If `/ready` is failing too, the database is the likely cause: check `docker compose logs db` and disk space with `df -h`.
3. If the errors began with the latest deploy (compare the "Running version" panel), roll back.

## ApiHighLatency
p95 is above 500ms for 10 minutes.
1. Use the "p95 latency by route" panel to find the slow route.
2. Look for slow queries: `SELECT query, mean_exec_time FROM pg_stat_statements` if the extension is enabled, otherwise `pg_stat_activity`.
3. Check whether the CPU or memory limits are saturated: `docker stats`.

## ApiEventLoopLag
The Node event loop is blocked (CPU-heavy synchronous work, or GC pressure from a memory leak). Check `nodejs_heap_size_used_bytes` for a steady climb, then restart the replica to mitigate: `docker compose restart api`.
