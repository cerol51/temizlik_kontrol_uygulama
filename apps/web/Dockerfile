# ------------------------------------------------------------------------------
# Production Multi-Stage Dockerfile for Vite Web Frontend
# ------------------------------------------------------------------------------

# 1. Aşama: Derleme (Build Stage)
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/

RUN npm ci

COPY apps/web ./apps/web
RUN npm run build --prefix apps/web

# 2. Aşama: Nginx Üretim Dağıtımı (Production Server)
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
