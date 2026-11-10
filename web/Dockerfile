FROM nginxinc/nginx-unprivileged:1.27-alpine

ARG APP_VERSION=dev
LABEL org.opencontainers.image.version=${APP_VERSION}

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-qO-", "http://127.0.0.1:8080/healthz"]
