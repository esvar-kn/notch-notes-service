# Notch — Dockerization & Container Orchestration

This document describes the containerization structure, Docker Compose stack, and production-ready operational workflows for the Notch API.

---

## 1. Multi-Stage Dockerfile (`DockerFile`)

To ensure a highly secure, optimized, and minimal runner footprint, the project uses a multi-stage Docker build:

```dockerfile
# ==============================================================================
# Build Stage
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./
COPY prisma ./prisma

# Install all dependencies (including devDependencies like Prisma CLI)
RUN npm ci

# Generate the Prisma Client into node_modules/@prisma/client
RUN npx prisma generate

# Copy the rest of the application files
COPY . .

# Prune devDependencies to keep final image clean and small
RUN npm prune --omit=dev


# ==============================================================================
# Execution Stage (Production)
# ==============================================================================
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy runtime artifacts from build stage
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/index.js ./index.js
COPY --from=builder /usr/src/app/middlewares ./middlewares
COPY --from=builder /usr/src/app/utils ./utils
COPY --from=builder /usr/src/app/prisma ./prisma

# Configure production environment
ENV NODE_ENV=production

# Expose server port
EXPOSE 3000

# Execute server
CMD ["node", "index.js"]
```

### Key Rationale
* **`node:20-alpine` Base**: Minimizes the container surface area to reduce security vulnerabilities and disk footprints.
* **Prisma Schema and Client Generation**: Prisma schema files are generated inside the build context to compile the client binaries tailored to alpine's architecture, and the `prisma` folder is copied to the final stage to allow run-time database migrations.
* **DevDependency Pruning**: Clears developer tool chains (like `nodemon`) to shrink the final runner layer size.

---

## 2. Docker Compose Orchestration (`docker-compose.yml`)

The multi-container orchestrator spins up the database, cache, and API services simultaneously and connects them on an isolated bridge network:

```yaml
services:
  # Relational Database Service (PostgreSQL)
  postgres:
    image: postgres:16-alpine
    container_name: notch-db
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-devpass}
      POSTGRES_DB: ${POSTGRES_DB:-notesdb}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d notesdb"]
      interval: 5s
      timeout: 5s
      retries: 5

  # In-memory Cache Service (Redis)
  redis:
    image: redis:7-alpine
    container_name: notch-cache
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # REST API Server
  api:
    build:
      context: .
      dockerfile: DockerFile
    container_name: notch-api
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file:
      - .env.docker
    command: sh -c "npx prisma migrate deploy && node index.js"

volumes:
  pgdata:
  redisdata:
```

### Operational Features
1. **Security (No Hardcoded Secrets)**: Database root passwords, JWT secret hashes, and connection URIs are loaded dynamically via variable interpolation (`${VARIABLE}`) and the `.env.docker` profile.
2. **Deterministic Startup sequence**: The `api` service waits for `notes-db` and `notes-cache` to pass their corresponding healthchecks before launching the application.
3. **Automated Schema Sync**: On startup, the `api` container executes `npx prisma migrate deploy` to ensure database tables (`Note` and `User`) are created automatically before the Express app boots.

---

## 3. Running the Stack

To build and launch the entire production-ready environment:

```bash
# Start all services in detached mode
docker compose up -d

# Check service logs
docker compose logs -f api

# Tear down the stack and remove volumes
docker compose down -v
```
