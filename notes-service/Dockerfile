# Build Stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate
COPY . .

# Production Stage
FROM node:20-alpine
WORKDIR /usr/src/app
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/server.js ./server.js
COPY --from=builder --chown=node:node /usr/src/app/middlewares ./middlewares
COPY --from=builder --chown=node:node /usr/src/app/utils ./utils
COPY --from=builder --chown=node:node /usr/src/app/prisma ./prisma

ENV NODE_ENV=production
USER node
EXPOSE 4002
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:4002/health" || exit 1

CMD ["node", "server.js"]
