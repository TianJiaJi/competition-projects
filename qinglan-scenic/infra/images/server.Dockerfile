# PostgreSQL runtime; schema migration is a separate release command.
FROM node:24-bookworm-slim
RUN npm install --global pnpm@10.17.1
WORKDIR /app
COPY . .
RUN pnpm install --prod --frozen-lockfile
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
ENTRYPOINT ["sh", "/app/infra/images/server-entrypoint.sh"]
