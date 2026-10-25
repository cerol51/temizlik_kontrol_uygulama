# ------------------------------------------------------------------------------
# Production Multi-Stage Dockerfile for NestJS API
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

ENV NODE_ENV=production
ENV API_PORT=3000

# Sadece üretim bağımlılıkları
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY apps/api/uploads ./apps/api/uploads

# Çalışma dizinini apps/api yap
WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/main.js"]
