# CalTrack MVP

Self-hostable calorie tracking app with React + Material UI frontend, Node/Express + Prisma backend, and Postgres. Run everything via Docker Compose.

## Services
- `frontend`: Vite + React + TypeScript, Material UI UI, Recharts for charting.
- `backend`: Express + TypeScript, Prisma ORM, Passport local auth + JWT cookies.
- `postgres`: Persistent database volume `postgres_data`.

## Quick start
1) Copy `.env.example` to `.env` and adjust secrets if desired.
2) Bring the stack up:
```bash
docker compose up --build
```
- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Postgres: exposed on 5432 (user/password `user`/`password`, db `fitness_app`).

## Backend notes
- Key env vars: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_ORIGIN`, `PORT`.
- Prisma schema lives in `backend/prisma/schema.prisma`. Apply migrations with `npx prisma migrate dev` (locally) or `npm run prisma:migrate` inside the container.
- Auth: signup/login issue http-only access + refresh JWT cookies. Refresh endpoint: `POST /auth/refresh`.
- Core routes:
  - `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
  - `GET/PUT /goals` (current weight, target weight, daily deficit)
  - `POST /weights`, `GET /weights`
  - `POST /food`, `GET /food`, `PUT /food/:id`, `DELETE /food/:id`
  - `GET /summary` (daily snapshot + projected goal), `GET /summary/history` (weights for chart)

## Frontend notes
- Set `VITE_API_BASE_URL` to the backend URL (defaults to http://localhost:4000).
- Auth state is cookie-based; API calls send `withCredentials` and auto-refresh tokens on 401.
- Pages: login/signup, dashboard (goals, weight entry, food log, daily summary, weight trend), history browser for weights/food by date.

## Developing inside devcontainer
- Devcontainer uses the `app` service (`Dockerfile` root) with docker-in-docker enabled. Use `docker compose up` from within the container to run the stack.

## Scripts
- Backend: `npm run dev`, `npm run build`, `npm run prisma:migrate`, `npm run start:prod`
- Frontend: `npm run dev`, `npm run build`, `npm run preview`
