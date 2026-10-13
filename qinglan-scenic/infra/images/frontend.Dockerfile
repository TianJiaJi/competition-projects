# Build from repository root. APP is one of the six application names.
FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@10.17.1
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
ARG APP
RUN case "$APP" in mobile) pnpm --filter @scenic/mobile build:h5 && cp -a apps/mobile/dist/build/h5 /out ;; \
    ops|visitor|admin|gate|demo) pnpm --filter "@scenic/$APP" build && cp -a "apps/$APP/dist" /out ;; \
    *) echo 'Invalid APP' >&2; exit 1 ;; esac
FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY infra/images/frontend.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html
EXPOSE 8080
