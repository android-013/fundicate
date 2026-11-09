# syntax=docker/dockerfile:1
FROM node:22.23.4-alpine@sha256:0e1754758c2df4cfa3e68d59e2e1b7374bb7fd9ea6328eaaacf15cc934af8202 AS base
# Prisma's generation/migration engine requires OpenSSL on musl Linux.
RUN apk add --no-cache openssl

FROM base AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
# The bundled npm CLI has its own vulnerable graph, outside package-lock.json.
RUN npm install --global npm@12.2.2 && npm ci --legacy-peer-deps

FROM dependencies AS builder
COPY . .
# Build-time values are inert placeholders. Real runtime secrets are never built in.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV APP_ORIGIN=http://127.0.0.1:3000
RUN npm run build

# Operator-only image: migrations, maintenance and diagnostics. Not exposed as a server.
FROM base AS tools
# Keep build caches, inactive contracts and global package-manager graphs out of
# the distributed operator image. The repository retains all historical source.
RUN apk upgrade --no-cache zlib && \
    rm -rf /usr/local/lib/node_modules /opt/yarn-* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/public/rules ./public/rules
COPY --from=builder --chown=node:node /app/docs/algorithms ./docs/algorithms
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/tsconfig.json /app/prisma.config.ts ./
USER node
CMD ["node", "scripts/doctor.mjs"]

FROM base AS runtime
# The server never invokes package managers. Keep their CLI-only dependency
# graphs out of the distributed web image while preserving /app/node_modules.
RUN apk upgrade --no-cache zlib && \
    rm -rf /usr/local/lib/node_modules /opt/yarn-* && \
    rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
