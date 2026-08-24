# Production Deployment Plan — Multi-Service Microservices Architecture

This document provides a comprehensive production deployment plan for the **Notch Notes Service** microservices architecture. It details container orchestration, cloud hosting topologies, environment configurations, CI/CD pipeline automation, zero-downtime deployment strategies, and monitoring workflows.

---

## 1. System Topology & Service Directory

```mermaid
graph TD
    Client["📱 Web Frontend (React + Vite)<br/>Hosted on CloudFront / Vercel"] -->|HTTP / REST| Gateway["🚀 API Gateway (Port 4000)<br/>Express + http-proxy-middleware"]
    Client -->|WebSockets| Gateway
    
    Gateway -->|/api/v1/auth & /api/v1/users| AuthSvc["🔐 Auth Service (Port 4001)<br/>JWT & Password Security"]
    Gateway -->|/api/v1/notes & /socket.io| NotesSvc["📝 Notes Service (Port 4002)<br/>CRUD + Socket.io WebSockets"]
    
    AuthSvc -->|Prisma ORM| Postgres[("🐘 PostgreSQL (Port 5432)<br/>Primary Database")]
    NotesSvc -->|Prisma ORM| Postgres
    NotesSvc -->|Caching| Redis[("⚡ Redis (Port 6379)<br/>Cache Layer")]
```

### Component Breakdown
1. **API Gateway (`gateway/`):** Reverse proxy entrypoint. Routes `/api/v1/auth` to port 4001, `/api/v1/notes` to port 4002, and upgrades `/socket.io` WebSockets.
2. **Auth Service (`auth-service/`):** Handles user registration, password hashing (`bcrypt`), login validation, and JWT token issuance.
3. **Notes Service (`notes-service/`):** Handles notes CRUD operations, JWT signature verification, Redis caching, and real-time Socket.io WebSocket rooms.
4. **Client Web App (`notch-frontend/`):** Single Page Application built with React 19, TanStack React Query, Redux Toolkit, and Socket.io Client.
5. **Database & Cache Infrastructure:** Shared PostgreSQL instance (`notesdb`) and Redis in-memory cache.

---

## 2. Containerization & Production Docker Setup

Each backend microservice includes an optimized multi-stage `Dockerfile` using `node:20-alpine` with security hardening (non-root node execution).

### A. Production Multi-Stage Dockerfile Pattern
```dockerfile
# Stage 1: Build & Install
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx prisma generate

# Stage 2: Minimal Runtime Security Image
FROM node:20-alpine AS runner
WORKDIR /app
NODE_ENV=production
USER node

COPY --chown=node:node --from=builder /app /app

EXPOSE 4002
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4002/health || exit 1

CMD ["node", "server.js"]
```

### B. Production Docker Compose (`docker-compose.prod.yml`)
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  auth-service:
    build:
      context: ./auth-service
      dockerfile: Dockerfile
    restart: always
    environment:
      PORT: 4001
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy

  notes-service:
    build:
      context: ./notes-service
      dockerfile: Dockerfile
    restart: always
    environment:
      PORT: 4002
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  gateway:
    build:
      context: ./gateway
      dockerfile: Dockerfile
    restart: always
    ports:
      - "4000:4000"
    environment:
      PORT: 4000
      NODE_ENV: production
      AUTH_SERVICE_URL: http://auth-service:4001
      NOTES_SERVICE_URL: http://notes-service:4002
    depends_on:
      - auth-service
      - notes-service

volumes:
  postgres_prod_data:
```

---

## 3. Environment Variable Matrix & Secrets Management

| Component | Variable Name | Production Value Example | Purpose / Description |
|---|---|---|---|
| **Gateway** | `PORT` | `4000` | Port for Gateway server |
| **Gateway** | `AUTH_SERVICE_URL` | `http://auth-service:4001` | Private internal route to Auth Service |
| **Gateway** | `NOTES_SERVICE_URL` | `http://notes-service:4002` | Private internal route to Notes Service |
| **Auth Service** | `DATABASE_URL` | `postgresql://user:pass@rds-endpoint:5432/notesdb` | Managed PostgreSQL connection string |
| **Auth Service** | `JWT_SECRET` | `prod-rsa-signed-long-secret-key-min-64-chars` | Signing key for issuing JWTs |
| **Notes Service** | `JWT_SECRET` | `prod-rsa-signed-long-secret-key-min-64-chars` | Signature verification key for validating JWTs |
| **Notes Service** | `REDIS_URL` | `redis://:secretpass@elasticache-endpoint:6379` | Managed Redis cluster connection string |
| **Frontend** | `VITE_API_URL` | `https://api.notch-notes.com` | Production API Gateway HTTPS domain |
| **Frontend** | `VITE_SOCKET_URL` | `https://api.notch-notes.com` | Production Socket.io WSS domain |

> 🔒 **Security Best Practice:** Secrets must be stored in a dedicated Secrets Manager (e.g. AWS Secrets Manager, HashiCorp Vault, or GitHub Repository Secrets) and never committed to source control.

---

## 4. Cloud Hosting Strategy & Infrastructure

### Strategy Option A: AWS Managed Production Cloud (Recommended for Enterprise)

```mermaid
flowchart LR
    subgraph Edge Layer
        CF["AWS CloudFront (CDN)"]
        S3["AWS S3 Bucket (Frontend Build Assets)"]
        ALB["AWS Application Load Balancer"]
    end

    subgraph Container Layer (AWS ECS Fargate)
        GWContainer["Gateway Task (Fargate)"]
        AuthContainer["Auth Service Task (Fargate)"]
        NotesContainer["Notes Service Task (Fargate)"]
    end

    subgraph Managed Data Layer
        RDS[("AWS RDS PostgreSQL<br/>Multi-AZ Instance")]
        ElastiCache[("AWS ElastiCache Redis<br/>Cluster")]
    end

    CF --> S3
    ALB -->|HTTPS / WSS| GWContainer
    GWContainer --> AuthContainer
    GWContainer --> NotesContainer
    AuthContainer --> RDS
    NotesContainer --> RDS
    NotesContainer --> ElastiCache
```

1. **Frontend Hosting:** Build artifacts (`npm run build`) deployed to AWS S3 and served via CloudFront CDN with SSL/TLS termination.
2. **Gateway & Microservices:** Deployed as AWS ECS Fargate tasks behind an Application Load Balancer (ALB) supporting HTTPS (port 443) and WebSockets (WSS).
3. **Database:** AWS RDS PostgreSQL (Multi-AZ deployment with automatic automated backups and point-in-time recovery).
4. **Cache:** AWS ElastiCache for Redis (multi-node cluster with auto-failover).

### Strategy Option B: PaaS Container Deployment (Render / Railway / Render Blueprint)
- **Gateway:** Deployed as Web Service on Render (`https://api.notch-notes.com`).
- **Auth & Notes Services:** Deployed as Private Services on internal network (`http://auth-service:4001`, `http://notes-service:4002`).
- **Frontend:** Deployed as Static Site on Vercel / Render Static.

---

## 5. Automated CI/CD Pipeline Workflow (GitHub Actions)

Create `.github/workflows/deploy.yml` to automate testing, building, database migration, and rolling deployment on every push to `main`.

```yaml
name: CI/CD Pipeline - Notch Microservices

on:
  push:
    branches: [ main ]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: devpass
          POSTGRES_DB: notesdb
        ports:
          - 5432:5432
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Test Auth Service
        run: |
          cd auth-service
          npm ci
          npx prisma db push
          npm test -- --coverage

      - name: Test Notes Service
        run: |
          cd notes-service
          npm ci
          npx prisma db push
          npm test -- --coverage

  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Test Frontend Components
        run: |
          cd notch-frontend
          npm ci
          npm test

  build-and-deploy:
    needs: [test-backend, test-frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry (GHCR / DockerHub)
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build & Push Gateway Image
        uses: docker/build-push-action@v5
        with:
          context: ./gateway
          push: true
          tags: ghcr.io/${{ github.repository }}/gateway:latest

      - name: Build & Push Auth Service Image
        uses: docker/build-push-action@v5
        with:
          context: ./auth-service
          push: true
          tags: ghcr.io/${{ github.repository }}/auth-service:latest

      - name: Build & Push Notes Service Image
        uses: docker/build-push-action@v5
        with:
          context: ./notes-service
          push: true
          tags: ghcr.io/${{ github.repository }}/notes-service:latest

      - name: Run Prisma Database Migrations
        run: |
          cd notes-service
          npx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.PROD_DATABASE_URL }}

      - name: Trigger Rolling Deployment (ECS / Render Webhook)
        run: |
          echo "Deploying updated container tasks..."
```

---

## 6. Observability, Logging & Health Monitoring

1. **Structured Logging:** All services use `winston` formatted with JSON in production mode (`logger.info`, `logger.error`), forwarding logs to Datadog, AWS CloudWatch, or Grafana Loki.
2. **Health Check Probes:**
   - `GET http://<service>:4001/health` (Liveness Check)
   - `GET http://<service>:4001/ready` (Readiness Check verifying DB connectivity)
3. **Database & Cache Health Resilience:**
   - If Redis goes offline, `notes-service` logs a warning and gracefully falls back to direct PostgreSQL reads without failing requests.
   - If PostgreSQL fails, `/ready` returns HTTP 503 so load balancers stop routing traffic to unhealthy tasks.

---

## 7. Disaster Recovery & Rollback Strategy

1. **Zero-Downtime Rolling Deployment:** New container versions are started and pass `/ready` health checks before old container instances are terminated.
2. **Database Rollbacks:** Database migrations must always be backward-compatible (e.g. adding columns as optional/default first).
3. **Instant Container Rollback:** If a deployed version exhibits errors, the CI/CD pipeline triggers an immediate container rollback to the previous tagged image (`ghcr.io/...:previous`).
