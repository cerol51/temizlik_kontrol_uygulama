# ------------------------------------------------------------------------------
# Production Multi-Stage Dockerfile for NestJS API
# Hardened for CIS Benchmarks & Pod Security Standards (Non-root, Tini Init)
# ------------------------------------------------------------------------------

# 1. Aşama: Derleme (Build Stage)
FROM node:20-alpine AS builder
WORKDIR /app

# Monorepo kök ve api paket tanımları
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/

RUN npm ci

COPY apps/api ./apps/api
RUN npm run build --prefix apps/api

# 2. Aşama: Çalıştırma (Production Runtime Stage)
FROM node:20-alpine AS runner
WORKDIR /app

# PID 1 zombi süreç temizliği ve sinyal iletimi (SIGTERM/SIGINT) için tini
RUN apk add --no-cache tini

ENV NODE_ENV=production
ENV API_PORT=3000

# Sadece üretim bağımlılıkları
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/uploads ./apps/api/uploads

# Güvenlik: Dosya sahipliklerini sınırla ve unprivileged 'node' kullanıcısına geç
RUN chown -R node:node /app

WORKDIR /app/apps/api
USER node

EXPOSE 3000

# Tini ile başlatarak düzgün kapanma (graceful shutdown) sağla
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
