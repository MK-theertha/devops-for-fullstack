# Notes: full-stack deployment reference

This project is a small notes app: a Node.js API, an nginx-served frontend, and Postgres. Its job is to show a complete, production-shaped deployment setup, so the app code is kept simple.

| Area | Where |
|---|---|
| Docker images (multi-stage, non-root, health checks) | [api/Dockerfile](api/Dockerfile), [web/Dockerfile](web/Dockerfile) |
| Compose stack, layered per environment | [docker-compose.yml](docker-compose.yml) + [override](docker-compose.override.yml) / [prod](docker-compose.prod.yml) / [monitoring](docker-compose.monitoring.yml) |
| CI (lint, test, migrate, Dockerfile/Compose checks, image scan, push) | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| CD (staging → approved production, smoke test, rollback) | [deploy.yml](.github/workflows/deploy.yml), [_deploy.yml](.github/workflows/_deploy.yml), [scripts/deploy.sh](scripts/deploy.sh) |
| Environment and secrets management | [.env.example](.env.example), [api/src/config.js](api/src/config.js), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#environments--secrets) |
| Logging and monitoring | [monitoring/](monitoring/), [docs/RUNBOOK.md](docs/RUNBOOK.md) |

```text
 Internet ──► Caddy (TLS) ──► web: nginx ──/api/*──► api ×2 ──► Postgres
                                  │                      │ (internal network)
                       JSON logs ─┴── Alloy ──► Loki ──┐ │ /metrics
                                                       ▼ ▼
                                        Grafana ◄── Prometheus (alert rules)
```

## Quick start

```bash
make dev              # app at http://localhost:8080, API at :3000, hot reload
make dev-monitoring   # + Grafana http://localhost:3001 (admin / see .env), Prometheus :9090
make test             # API unit tests
make help             # all targets
```

The first run creates `.env` from `.env.example`. If port 5432 is already in use on your machine, set `DB_PORT` in `.env`.

## Documentation

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): environments, pipeline, server setup, deploying, rolling back
- [docs/RUNBOOK.md](docs/RUNBOOK.md): dashboards, logs, and what to do when each alert fires
