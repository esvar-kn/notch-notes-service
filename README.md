# Notch — Microservices Architecture & Real-Time Notes System

**Notch** is a production-ready, full-stack microservices application built with Express 5, React 19, PostgreSQL, Redis, and Socket.io. The backend is decomposed into decoupled microservices routed through an API Gateway, supporting real-time collaborative editing and client-side server-state management.

---

## 📌 Architecture Overview

```mermaid
graph TD
    Client["📱 Web Frontend (React 19 + Vite)<br/>React Query + Redux Toolkit + Socket.io"] -->|REST API / WSS| Gateway["🚀 API Gateway (Port 4000)<br/>Express + http-proxy-middleware"]
    
    Gateway -->|/api/v1/auth & /api/v1/users| AuthSvc["🔐 Auth Service (Port 4001)<br/>bcrypt + JWT Issuance"]
    Gateway -->|/api/v1/notes & /socket.io| NotesSvc["📝 Notes Service (Port 4002)<br/>Notes CRUD + Socket.io Rooms"]
    
    AuthSvc --> Postgres[("🐘 PostgreSQL (Port 5432)<br/>User & Notes Relational DB")]
    NotesSvc --> Postgres
    NotesSvc --> Redis[("⚡ Redis (Port 6379)<br/>Cache-Aside Store")]
```

### Microservice Directory & Port Allocation

| Component | Path | Port | Key Responsibilities |
|---|---|---|---|
| **API Gateway** | [`gateway/`](gateway/) | `4000` | Unified entrypoint, path proxy routing, WebSocket upgrade handling |
| **Auth Service** | [`auth-service/`](auth-service/) | `4001` | User registration, password hashing (`bcrypt`), JWT token issuance |
| **Notes Service** | [`notes-service/`](notes-service/) | `4002` | Notes CRUD, JWT signature verification, Redis caching, Socket.io real-time rooms |
| **Client Frontend** | [`notch-frontend/`](notch-frontend/) | `5173` | SPA built with React 19, TanStack React Query, Redux Toolkit, and Socket.io Client |

---

## ✨ Features & Capabilities

- **Microservices Routing via API Gateway:** Centralized reverse-proxy entrypoint (`http://localhost:4000`) routing `/api/v1/auth` to port 4001 and `/api/v1/notes` to port 4002.
- **JWT Signature Verification:** Decoupled verification where `auth-service` issues tokens and `notes-service` independently verifies signatures without hitting `auth-service`.
- **Real-Time Collaborative Editing:** Socket.io WebSockets with `join-note` room isolation, debounced keystroke emission, and **Last-Write-Wins (LWW)** conflict resolution.
- **Server-State Management (TanStack React Query):** Automatic background refetching and cache invalidation on note mutations (`queryKey: ['notes']`).
- **Client-State Management (Redux Toolkit):** Filtering notes by state (`all`, `starred`, `archived`) and managing client-side star/archive toggles.
- **Redis Cache-Aside:** Graceful fallback to PostgreSQL database when Redis is offline.
- **Automated Testing Suite:** 
  - Backend integration tests with **Jest & Supertest** (> 77% to 88% code coverage).
  - Frontend component tests with **Vitest & React Testing Library**.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js:** v20+
- **PostgreSQL:** Running on port 5432 with database `notesdb` (`postgresql://postgres:devpass@localhost:5432/notesdb`)
- **Redis:** Running on port 6379 (optional, caching fallback enabled)

### 2. Environment Configuration
Create `.env` or `.env.test` files in microservice directories:

- **`auth-service/.env`**:
  ```env
  PORT=4001
  DATABASE_URL="postgresql://postgres:devpass@localhost:5432/notesdb"
  JWT_SECRET="NotesAppSuperSecretKey32CharsLongRequirement!"
  ```

- **`notes-service/.env`**:
  ```env
  PORT=4002
  DATABASE_URL="postgresql://postgres:devpass@localhost:5432/notesdb"
  REDIS_URL="redis://localhost:6379"
  JWT_SECRET="NotesAppSuperSecretKey32CharsLongRequirement!"
  ```

- **`gateway/.env`**:
  ```env
  PORT=4000
  AUTH_SERVICE_URL="http://localhost:4001"
  NOTES_SERVICE_URL="http://localhost:4002"
  ```

### 3. Run Microservices Stack

```bash
# Terminal 1: Auth Service
cd auth-service && npm install && npm start

# Terminal 2: Notes Service
cd notes-service && npm install && npm start

# Terminal 3: API Gateway
cd gateway && npm install && npm start

# Terminal 4: Frontend
cd notch-frontend && npm install && npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 🧪 Testing Suite

### Running Backend Tests (Jest + Supertest)
```bash
# Auth Service Integration Tests & Coverage
cd auth-service && npm test

# Notes Service Integration Tests & Coverage
cd notes-service && npm test
```

### Running Frontend Tests (Vitest + React Testing Library)
```bash
cd notch-frontend && npm test
```

---

## 🐳 Docker Orchestration

Orchestrate the entire multi-service stack with Docker Compose:

```bash
docker compose up --build -d
```

Containers launched:
- `postgres` (port 5432)
- `redis` (port 6379)
- `auth-service` (port 4001)
- `notes-service` (port 4002)
- `gateway` (port 4000)

---

## 📖 System Documentation

- **[docs/deployment_plan.md](docs/deployment_plan.md):** Production Deployment Plan (AWS ECS / PaaS, CI/CD GitHub Actions, Zero-Downtime Releases).
- **[docs/websocket-schema-spec.md](docs/websocket-schema-spec.md):** Socket.io Event Schema & Real-Time Collaborative Editing Specification.
- **[docs/API_SPEC.md](docs/API_SPEC.md):** REST API Specification reference.
- **[docs/SCHEMA.md](docs/SCHEMA.md):** PostgreSQL Relational Schema reference.
- **[docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md):** System Architecture & Scaling Design Document.
