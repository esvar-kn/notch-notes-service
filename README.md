# Notch

**Notch** is a production-ready, full-stack notes application: a secure REST API (Express 5 + PostgreSQL/Prisma + Redis) and a React single-page frontend (Vite + React 19). Users can register, log in, and manage their personal notes with pagination, search, and per-user isolation.

This repository is a monorepo:
- **Backend** — the API, at the repository root.
- **Frontend** — the React SPA, in [`notch-frontend/`](notch-frontend/).

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Backend](#backend)
  - [Getting Started](#backend-getting-started)
  - [API Overview](#api-overview)
  - [Environment Variables](#backend-environment-variables)
  - [Testing](#backend-testing)
  - [Docker](#running-with-docker-compose)
- [Frontend](#frontend)
  - [Getting Started](#frontend-getting-started)
  - [Routes & Auth Flow](#routes--auth-flow)
  - [Environment Variables](#frontend-environment-variables)
- [Running the Full Stack Locally](#running-the-full-stack-locally)
- [Deployment](#deployment)
- [Security & Reliability](#security--reliability)
- [Documentation](#documentation)

## Features

- **JWT authentication** — register, log in, update, and delete your own account.
- **Notes CRUD** — create, read, update, delete, with pagination, sorting, and case-insensitive search, all scoped to the authenticated user.
- **Referential integrity** — a `Note.userId` foreign key with `ON DELETE CASCADE`; deleting a user atomically removes their notes.
- **Redis caching** — cache-aside on note reads with graceful fallback to PostgreSQL when Redis is offline.
- **Hardened for production** — Helmet, CORS allow-list, Redis-backed rate limiting, input sanitization, config validation, health probes, structured logging, and graceful shutdown.
- **Tested & CI-gated** — DB-backed integration tests run in GitHub Actions against real PostgreSQL and Redis.

## Architecture

```mermaid
graph LR
    User[User Browser]
    subgraph Frontend [Frontend — Vercel]
        SPA[React SPA<br/>Vite + React Router]
    end
    subgraph Backend [Backend — Railway]
        API[Express 5 API<br/>JWT · Zod · Prisma]
    end
    PG[(PostgreSQL<br/>Users + Notes)]
    Redis[(Redis<br/>Cache + Rate limits)]

    User --> SPA
    SPA -- "REST /api/v1 (Bearer JWT)" --> API
    API --> PG
    API -. cache-aside .-> Redis

    style SPA fill:#e1f5fe,stroke:#0288d1
    style API fill:#e8f5e9,stroke:#2e7d32
    style PG fill:#efebe9,stroke:#5d4037
    style Redis fill:#ffe0b2,stroke:#f57c00
```

- The **frontend** is a stateless SPA that stores the JWT in `localStorage` and attaches it as a `Bearer` token via an Axios interceptor.
- The **backend** is a stateless API — any instance can serve any request — with PostgreSQL as the single source of truth and Redis as a shared cache / rate-limit store.
- For the scaling roadmap to 1M users, see [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md).

## Tech Stack

**Backend**

| Layer          | Technology                    |
|----------------|-------------------------------|
| Runtime        | Node.js v20+                  |
| Framework      | Express 5                     |
| Database       | PostgreSQL                    |
| ORM / Client   | Prisma 6                      |
| Cache Database | Redis (`ioredis`)             |
| Auth           | JWT (jsonwebtoken) + bcrypt   |
| Validation     | Zod & Validator.js            |
| Security       | Helmet, CORS, Rate Limit      |
| Logging        | Winston                       |

**Frontend**

| Layer        | Technology                     |
|--------------|--------------------------------|
| Framework    | React 19                       |
| Build Tool   | Vite                           |
| Routing      | React Router 7                 |
| HTTP Client  | Axios (with interceptors)      |
| State        | React Context + `useReducer`   |
| Linting      | Oxlint                         |

## Repository Structure

```
notch-notes/                   # Backend (repository root)
├── docs/                      # API spec, schema, system design, Docker docs
├── middlewares/auth.js        # JWT protect middleware (loads user from PostgreSQL)
├── prisma/
│   ├── migrations/            # PostgreSQL DB migrations
│   └── schema.prisma          # Prisma relational schema (User + Note)
├── tests/
│   ├── auth.test.js           # Validation/auth-failure tests
│   └── integration.test.js    # DB-backed CRUD, ownership & regression tests
├── utils/
│   ├── appError.js            # Operational error class
│   ├── config.js              # Validated env config (Zod) — loaded first
│   ├── logger.js              # Winston logger config
│   └── prisma.js              # Shared PrismaClient + pg Pool singleton
├── index.js                   # App entry point (routes + middleware)
├── DockerFile                 # Multi-stage, non-root production image
├── docker-compose.yml         # api + postgres + redis stack
├── railway.json               # Railway deploy + healthcheck config
├── .env.example               # Backend env template
├── .env.test.example          # Test env template
│
└── notch-frontend/            # Frontend (React SPA)
    ├── src/
    │   ├── pages/             # AuthPage, DashboardPage, NotesListPage, NoteDetailPage
    │   ├── components/        # LoginForm, SignupForm, NoteCard, CreateNoteModal, Navbar, ProtectedRoute…
    │   ├── context/           # AuthContext + authReducer (JWT state)
    │   ├── services/          # api (Axios), authService, notesService
    │   └── App.jsx            # Route definitions
    ├── vite.config.js         # Dev server + /api proxy to localhost:3000
    ├── vercel.json            # SPA rewrite rules for Vercel
    └── .env.example           # Frontend env template (VITE_API_URL)
```

---

# Backend

<a id="backend-getting-started"></a>
## Getting Started

### 1. Install

```bash
git clone https://github.com/esvar-kn/notch-notes.git
cd notch-notes
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=3000
JWT_SECRET=your_super_secret_key_here   # must be >= 32 chars in production
JWT_EXPIRY=1h
SALT_ROUNDS=12
DATABASE_URL="postgresql://postgres:password@localhost:5432/notesdb"
REDIS_URL="redis://localhost:6379"
```

### 3. Set up the database

Apply migrations (creates the `User` and `Note` tables) and generate the Prisma Client:
```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Run

PostgreSQL must be running; Redis is optional (the API falls back to PostgreSQL if it's offline).
```bash
npm run dev     # development — nodemon, colored logs
npm start       # production mode
```

## API Overview

Base URL: `/api/v1`. All note routes and the user update/delete routes require an `Authorization: Bearer <token>` header. Full request/response details are in [docs/API_SPEC.md](docs/API_SPEC.md).

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/users/register` | — | Create an account |
| `POST` | `/api/v1/users/login` | — | Log in, receive a JWT |
| `PUT` | `/api/v1/users` | ✅ | Update your own profile |
| `DELETE` | `/api/v1/users` | ✅ | Delete your account (cascades to notes) |
| `POST` | `/api/v1/notes` | ✅ | Create a note |
| `GET` | `/api/v1/notes` | ✅ | List your notes (paginated, sortable, searchable) |
| `GET` | `/api/v1/notes/:id` | ✅ | Get one of your notes |
| `PUT` | `/api/v1/notes/:id` | ✅ | Update one of your notes |
| `DELETE` | `/api/v1/notes/:id` | ✅ | Delete one of your notes |
| `GET` | `/health` | — | Liveness probe |
| `GET` | `/ready` | — | Readiness probe (checks PostgreSQL) |

<a id="backend-environment-variables"></a>
## Environment Variables

Configuration differs by run target:
* **`.env`** — running the server locally outside Docker (`npm run dev`).
* **`.env.docker`** — running via Docker Compose or a standalone container.

All variables are validated at boot; the server refuses to start on invalid config.

### 1. Core Server Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | ❌ | `3000` | Port the Express server listens on |
| `JWT_SECRET` | ✅ | — | Secret for signing/verifying JWTs. Must be **≥32 chars in production** |
| `JWT_EXPIRY` | ❌ | `1h` | Token expiration duration (e.g., `1h`, `7d`) |
| `SALT_ROUNDS` | ❌ | `12` | bcrypt cost factor (4–15) |
| `ALLOWED_ORIGIN` | ❌ | localhost dev origins | Comma-separated CORS allow-list (set to your frontend domain in prod) |
| `TRUST_PROXY` | ❌ | `1` in prod, `0` otherwise | Proxy hops to trust for the client IP (Railway = 1) |
| `PG_POOL_MAX` | ❌ | `10` | Max PostgreSQL connections per instance |

### 2. Local Run (`.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://postgres:devpass@localhost:5432/notesdb` | Local PostgreSQL connection (server exits if missing) |
| `REDIS_URL` | ❌ | `redis://localhost:6379` | Local Redis connection (caching disabled if unreachable) |

### 3. Docker Compose Run (`.env.docker`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://postgres:devpass@postgres:5432/notesdb` | Connection to the `postgres` compose service |
| `REDIS_URL` | ✅ | `redis://redis:6379` | Connection to the `redis` compose service |
| `POSTGRES_USER` | ❌ | `postgres` | Root PostgreSQL user for the container |
| `POSTGRES_PASSWORD` | ❌ | `devpass` | Root PostgreSQL password for the container |
| `POSTGRES_DB` | ❌ | `notesdb` | Default database created on startup |

*(For a standalone `docker run` connecting to host databases, use `host.docker.internal` instead of `postgres`/`redis`.)*

<a id="backend-testing"></a>
## Testing

Two layers:
- `tests/auth.test.js` — validation/auth-failure checks (no database needed).
- `tests/integration.test.js` — DB-backed CRUD, ownership isolation, and the delete-cascade/email-reuse regression, against a **dedicated test database**.

```bash
# One-time setup
createdb notesdb_test
cp .env.test.example .env.test

# Apply schema, then run
DATABASE_URL="postgresql://postgres:devpass@localhost:5432/notesdb_test" npx prisma migrate deploy
npm test
```

CI runs the same suite against ephemeral PostgreSQL and Redis service containers — see [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Running with Docker Compose

Runs the API, PostgreSQL, and Redis together:

```bash
cp .env.docker.example .env.docker    # set JWT secret and DB passwords
docker compose up -d --build
```

Migrations (`npx prisma migrate deploy`) run automatically when the API container starts. See [docs/DOCKER.md](docs/DOCKER.md) for details.

---

# Frontend

A React 19 SPA built with Vite. It talks to the backend over REST, storing the JWT in `localStorage` and attaching it to every request via an Axios interceptor. On a `401` it clears the session and redirects to login.

<a id="frontend-getting-started"></a>
## Getting Started

```bash
cd notch-frontend
npm install
cp .env.example .env        # optional for local dev (see below)
npm run dev                 # Vite dev server on http://localhost:5173
```

Other scripts:
```bash
npm run build     # production build to dist/
npm run preview   # preview the production build
npm run lint      # Oxlint
npm test          # api + auth context unit tests
```

## Routes & Auth Flow

| Route | Access | Purpose |
|-------|--------|---------|
| `/login`, `/signup` | Public | Authentication (redirects to `/dashboard` if already logged in) |
| `/dashboard` | Protected | Landing page after login |
| `/notes` | Protected | Paginated notes list with create/delete |
| `/notes/:id` | Protected | Note detail + edit |
| `/`, `*` | — | Redirect to `/dashboard` or `/login` based on auth state |

Protected routes are gated by `ProtectedRoute`, which redirects unauthenticated users to `/login`. Auth state lives in `AuthContext` (a `useReducer` store) and is hydrated from `localStorage` on refresh.

<a id="frontend-environment-variables"></a>
## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | ❌ locally / ✅ in prod | Full backend API base URL including `/api/v1` (e.g. `https://your-api.up.railway.app/api/v1`). |

In local development you can leave `VITE_API_URL` unset — the Vite dev server proxies `/api` to `http://localhost:3000` (see [vite.config.js](notch-frontend/vite.config.js)). In production it **must** point at the deployed backend.

---

## Running the Full Stack Locally

1. **Databases** — start PostgreSQL (and optionally Redis) locally.
2. **Backend** — from the repo root: `npm install && npm run dev` (serves on `http://localhost:3000`).
3. **Frontend** — in another terminal: `cd notch-frontend && npm install && npm run dev` (serves on `http://localhost:5173`).
4. Open `http://localhost:5173`. The frontend proxies API calls to the backend automatically, so no `VITE_API_URL` is needed for local dev.

## Deployment

The two apps deploy independently.

**Backend → Railway**
- Uses [railway.json](railway.json) (Dockerfile build, `/health` healthcheck, restart-on-failure). Migrations apply automatically in the background at startup.
- Provision a **PostgreSQL** and a **Redis** service, then set: `JWT_SECRET` (≥32 chars — the app refuses to boot otherwise), `DATABASE_URL`, `REDIS_URL`, and `ALLOWED_ORIGIN` = your frontend domain.

**Frontend → Vercel**
- Root directory `notch-frontend`; build `npm run build`, output `dist`. SPA routing is handled by [vercel.json](notch-frontend/vercel.json).
- Set `VITE_API_URL` to the Railway backend URL (including `/api/v1`).

**CORS wiring:** the backend's `ALLOWED_ORIGIN` must include the exact Vercel domain, or browser requests will be blocked.

## Security & Reliability

- **Rate limiting** — `express-rate-limit` on all `/api/` routes (100 req / 15 min per IP), plus a stricter auth limiter (20 failed attempts / 15 min) to throttle credential brute-force. Uses a **shared Redis store** so limits hold across instances, and fails open if Redis is down.
- **HTTP headers** — `helmet` sets secure response headers.
- **CORS** — credential-aware allow-list of origins.
- **Input sanitization** — note title/content escaped via `validator.escape()` in the Zod middleware; request bodies capped at 100 kB.
- **Config validation** — every env var validated at boot with Zod; a ≥32-char `JWT_SECRET` is enforced in production.
- **Health probes** — `GET /health` (liveness) and `GET /ready` (readiness — checks PostgreSQL).
- **Operations** — structured JSON logs to stdout in production, graceful shutdown on `SIGTERM`/`SIGINT`, connection-pool caps, response `compression`, and a non-root Docker container with a `HEALTHCHECK`.

## Documentation

| Document | Contents |
|----------|----------|
| [docs/API_SPEC.md](docs/API_SPEC.md) | Full REST API reference — every endpoint, request/response, and error |
| [docs/SCHEMA.md](docs/SCHEMA.md) | Relational schema (PostgreSQL) and design rationale |
| [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) | Scaling architecture and roadmap to 1M users |
| [docs/DOCKER.md](docs/DOCKER.md) | Containerization and Docker Compose details |
