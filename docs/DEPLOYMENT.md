# Deployment guide

## Environments & secrets

| | Local | CI | Staging / Production |
|---|---|---|---|
| Config source | `.env` (copied from `.env.example`) | Workflow `env:` and a Postgres service container | GitHub Environment **vars** + **secrets**, written to `/opt/notes/.env` (mode 600) on every deploy |
| Compose files | base + override (auto-merged) | none (images built directly) | base + prod + monitoring |
| Images | built locally (`notes/*:local`) | built and scanned; pushed to GHCR on `main` | pulled from GHCR by immutable git-SHA tag |

Rules:
- Secrets are never baked into images or committed. `.env*` is gitignored and excluded from Docker build contexts.
- The API validates its config at startup (`api/src/config.js`), so a misconfigured container fails immediately instead of failing on the first request. Any `KEY` can also be supplied as `KEY_FILE` (Docker/Kubernetes secrets).
- Compose uses `${VAR:?message}` for required values, so a missing password stops `docker compose` before anything starts.
- The same image runs everywhere. Only the environment differs. `APP_VERSION` is baked in at build time, so `/api/health` reports what is actually running.

### GitHub Environment setup

Create `staging` and `production` under **Settings → Environments**. On `production`, add **required reviewers**; this is the approval gate.

| Kind | Name | Notes |
|---|---|---|
| var | `DEPLOY_HOST`, `DEPLOY_USER` | SSH target |
| var | `DOMAIN` | Public hostname; Caddy gets a TLS certificate for it |
| var | `LOG_LEVEL` | Optional, default `info` |
| secret | `DEPLOY_SSH_KEY` | Private key of a deploy-only user |
| secret | `DEPLOY_KNOWN_HOSTS` | Output of `ssh-keyscan <host>`. Host keys are pinned, not trusted on first use |
| secret | `GHCR_READ_TOKEN` | PAT with `read:packages` only |
| secret | `POSTGRES_PASSWORD` | URL-safe, e.g. `openssl rand -hex 24` |
| secret | `GRAFANA_ADMIN_PASSWORD` | |

## Pipeline

```text
PR ──► CI: lint · migrate (real Postgres, run twice for idempotency) · unit tests
           hadolint · compose config · promtool · shellcheck
           build images · Trivy scan (fails on fixable HIGH/CRITICAL)

main ──► CI as above + push ghcr.io/<owner>/notes-{api,web}:<sha>
     ──► Deploy: staging (automatic) ──► production (waits for approval)
```

Each deploy job (`_deploy.yml`):
1. Checks out the deployed SHA, so the Compose files match the image.
2. Writes `.env` from Environment secrets and rsyncs the stack definition to `/opt/notes`.
3. Runs `scripts/deploy.sh <sha>` on the host:
   - pulls images
   - runs the one-shot `migrate` service (protected by an advisory lock)
   - starts the API and web containers
   - waits until every container's health check reports healthy
   - **if anything fails, it redeploys the last good tag automatically**
4. Smoke test: requests `https://$DOMAIN/api/health` and checks that the reported `version` equals the deployed SHA. If this check fails, the job runs `deploy.sh --rollback`.

Deploys to the same environment are serialized with a `concurrency` group and are never cancelled mid-run.

## First-time server setup

On Ubuntu 24.04 (any host with Docker Engine and the Compose plugin works):

```bash
curl -fsSL https://get.docker.com | sh
sudo useradd -m -s /bin/bash -G docker deploy
sudo install -d -o deploy -g deploy /opt/notes
sudo -u deploy mkdir -p ~deploy/.ssh && echo "<public key>" | sudo -u deploy tee ~deploy/.ssh/authorized_keys
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
```

Point the DNS record for `DOMAIN` at the host, then trigger **Deploy → Run workflow**.

## Day-2 operations

| Task | How |
|---|---|
| Deploy a specific build | Actions → Deploy → Run workflow → choose environment + full SHA |
| Roll back | Same as above with the previous SHA, or `ssh deploy@host /opt/notes/scripts/deploy.sh --rollback` |
| Deploy history | `cat /opt/notes/.deploy/history` |
| Status / logs on host | `cd /opt/notes && docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml ps` (or `logs -f api`) |
| Dashboards | `ssh -L 3001:localhost:3001 -L 9090:localhost:9090 deploy@host`, then open http://localhost:3001 |

### Database migrations

Migrations are **not** rolled back when the application is rolled back. Every migration must therefore be backward compatible with the previous release (expand/contract):
1. Release N adds the new column, table, or index. Old code ignores it.
2. Release N+1 switches the code to use it.
3. Release N+2 removes the old structure.

Back up the database before a risky migration: `docker compose exec db pg_dump -U notes notes | gzip > backup-$(date +%F).sql.gz`.

## Production hardening already in place

- Non-root containers, `no-new-privileges`, all capabilities dropped, read-only API filesystem
- CPU and memory limits; `restart: unless-stopped`; 2 API replicas
- The Postgres network is `internal` and has no published port in production
- Grafana and Prometheus are bound to `127.0.0.1`; access them through an SSH tunnel
- Container logs rotate (10 MB × 5 files)
- HSTS, CSP, and nosniff/frame-deny headers

Not included, and recommended next: automated off-host database backups, Alertmanager routing to Slack/PagerDuty, a managed Postgres for production.
