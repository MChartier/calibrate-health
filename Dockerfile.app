# syntax=docker/dockerfile:1

# Multi-stage production image:
# - Builds frontend (Vite) + backend (TypeScript) and runs the backend server.
# - Includes Prisma CLI + migrations so deployments can run `prisma migrate deploy` inside the container.

# Pin the multi-platform base digest so release rebuilds do not silently change underneath a tag.
FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base
RUN apk add --no-cache bash openssl ca-certificates
WORKDIR /app

FROM base AS deps

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

FROM deps AS build

COPY backend ./backend
COPY frontend ./frontend
COPY shared ./shared
COPY scripts/frontend-build-budget.mjs ./scripts/frontend-build-budget.mjs

RUN cd backend && npm run build
RUN cd frontend && npm run build

FROM base AS runtime-deps

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev --no-audit --fund=false

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_DIST_DIR=/app/frontend/dist

WORKDIR /app

COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=runtime-deps /app/backend/node_modules /app/backend/node_modules
# `npm ci --omit=dev` installs @prisma/client but does not generate its schema-specific runtime.
COPY --from=build /app/backend/node_modules/.prisma /app/backend/node_modules/.prisma
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/backend/prisma /app/backend/prisma
COPY --from=build /app/backend/prisma.config.ts /app/backend/prisma.config.ts
COPY --from=build /app/backend/scripts /app/backend/scripts

COPY --from=build /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend
EXPOSE 3000

# The entrypoint calls Node and Prisma directly; npm is build tooling and is not part of the
# production attack surface. Removing it also avoids shipping npm's bundled dependencies.
RUN chmod +x /app/backend/scripts/start-prod.sh \
    && rm -rf \
      /usr/local/lib/node_modules/npm \
      /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm \
      /usr/local/bin/npx \
      /usr/local/bin/corepack \
      /usr/local/bin/yarn \
      /usr/local/bin/yarnpkg \
      /opt/yarn-*

CMD ["./scripts/start-prod.sh"]
