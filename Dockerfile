# syntax=docker/dockerfile:1
FROM node:22.22.2-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
# Build-time values are inert placeholders. Real runtime secrets are never built in.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV APP_ORIGIN=http://127.0.0.1:3000
RUN npm run build

# Operator-only image: migrations, maintenance and diagnostics. Not exposed as a server.
FROM builder AS tools
ENV NODE_ENV=production
USER node
CMD ["node", "scripts/doctor.mjs"]

FROM node:22.22.2-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
