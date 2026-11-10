#!/usr/bin/env bash
# Runs ON the target host (invoked over SSH by .github/workflows/_deploy.yml).
#
#   scripts/deploy.sh <image-tag>    deploy a specific image tag (git SHA)
#   scripts/deploy.sh --rollback     redeploy the previously successful tag
#
# Pulls images, starts the stack (migrations run first via the `migrate`
# service), waits for health checks, and automatically reverts to the last
# good tag if the new version never becomes healthy.
set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose --env-file .env
  -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml)
STATE_DIR=.deploy
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
mkdir -p "$STATE_DIR"

log() { printf '[deploy %s] %s\n' "$(date -u +%FT%TZ)" "$*"; }
die() { log "ERROR: $*"; exit 1; }

[[ -f .env ]] || die ".env not found in $(pwd)"

CURRENT=$(cat "$STATE_DIR/current" 2>/dev/null || true)
if [[ "${1:-}" == "--rollback" ]]; then
  TAG=$(cat "$STATE_DIR/previous" 2>/dev/null) || die "no previous deployment recorded"
  log "rolling back from ${CURRENT:-<none>} to $TAG"
else
  TAG=${1:?usage: deploy.sh <image-tag> | --rollback}
fi

# Persist the tag in .env so ad-hoc `docker compose ...` commands on the
# host refer to the running version.
set_tag() {
  local tmp; tmp=$(mktemp)
  grep -v '^IMAGE_TAG=' .env > "$tmp" || true
  echo "IMAGE_TAG=$1" >> "$tmp"
  cat "$tmp" > .env && rm -f "$tmp"
}

wait_healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) svc cid status
  for svc in api web; do
    for cid in $("${COMPOSE[@]}" ps -q "$svc"); do
      while :; do
        status=$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo missing)
        [[ $status == healthy ]] && break
        if (( SECONDS > deadline )); then
          log "$svc ($cid) is '$status' after ${HEALTH_TIMEOUT}s"
          return 1
        fi
        sleep 3
      done
    done
    log "$svc healthy"
  done
}

# Steps are chained with && because `set -e` is suspended inside a function
# called from an `if` condition: without it a failed pull would be ignored.
release() {
  log "deploying $1"
  set_tag "$1" &&
    "${COMPOSE[@]}" pull --quiet &&
    "${COMPOSE[@]}" up -d --remove-orphans &&
    wait_healthy
}

if release "$TAG"; then
  if [[ -n $CURRENT && $CURRENT != "$TAG" ]]; then echo "$CURRENT" > "$STATE_DIR/previous"; fi
  echo "$TAG" > "$STATE_DIR/current"
  echo "$(date -u +%FT%TZ) $TAG" >> "$STATE_DIR/history"
  docker image prune -af --filter "until=168h" > /dev/null
  log "deployed $TAG"
else
  log "deploy of $TAG failed; service state and recent logs:"
  "${COMPOSE[@]}" ps -a --format '    {{.Service}}: {{.Status}}' || true
  "${COMPOSE[@]}" logs --no-color --tail 15 migrate api web 2>&1 | sed 's/^/    /' || true
  if [[ -n $CURRENT && $CURRENT != "$TAG" ]]; then
    log "auto-rolling back to $CURRENT"
    release "$CURRENT" || log "ROLLBACK ALSO FAILED: manual intervention required"
  fi
  exit 1
fi
