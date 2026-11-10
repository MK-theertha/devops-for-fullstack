PROD := -f docker-compose.yml -f docker-compose.prod.yml
MON  := -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.monitoring.yml

.PHONY: help setup dev dev-monitoring down logs ps test lint migrate psql config clean

help:            ## List targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

setup:           ## Create .env from the template (first run only)
	@test -f .env || cp .env.example .env && echo ".env ready"

dev: setup       ## Run the app locally with hot reload
	docker compose up --build

dev-monitoring: setup  ## Run the app plus Prometheus, Loki, Grafana
	docker compose $(MON) up --build

down:            ## Stop everything (keeps volumes)
	docker compose $(MON) down --remove-orphans

logs:            ## Tail logs for all services
	docker compose logs -f --tail=100

ps:              ## Show service status and health
	docker compose ps

test:            ## Run API unit tests
	cd api && npm test

lint:            ## Lint API code
	cd api && npm run lint

migrate:         ## Apply DB migrations in the running stack
	docker compose run --rm migrate

psql:            ## Open a psql shell on the local DB
	docker compose exec db sh -c 'psql -U "$$POSTGRES_USER" "$$POSTGRES_DB"'

config:          ## Render the merged production Compose config
	docker compose $(PROD) -f docker-compose.monitoring.yml config

clean:           ## Stop everything AND delete volumes (destroys local data)
	docker compose $(MON) down -v --remove-orphans
