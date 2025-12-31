# syntax=docker/dockerfile:1

# Multi-stage production image:
# - Builds frontend (Vite) + backend (TypeScript) and runs the backend server.
# - Includes Prisma CLI + migrations so deployments can run `prisma migrate deploy` inside the container.

FROM node:20-bookworm-slim AS base
WORKDIR /app

FROM base AS deps

COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci

COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci

FROM deps AS build

COPY backend ./backend
COPY frontend ./frontend
COPY shared ./shared

RUN cd backend && npm run prisma:generate
RUN cd backend && npm run build
RUN cd frontend && npm run build

FROM base AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV FRONTEND_DIST_DIR=/app/frontend/dist

WORKDIR /app

COPY --from=build /app/backend/package.json /app/backend/package.json
COPY --from=build /app/backend/package-lock.json /app/backend/package-lock.json
COPY --from=build /app/backend/node_modules /app/backend/node_modules
COPY --from=build /app/backend/dist /app/backend/dist
COPY --from=build /app/backend/prisma /app/backend/prisma
COPY --from=build /app/backend/prisma.config.ts /app/backend/prisma.config.ts

COPY --from=build /app/frontend/dist /app/frontend/dist

WORKDIR /app/backend
EXPOSE 3000

CMD ["npm", "run", "start"]

