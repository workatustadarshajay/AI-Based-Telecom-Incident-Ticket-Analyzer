# ---------- build stage: compile TypeScript + Vite production bundle ----------
FROM node:22-alpine AS build

WORKDIR /app

# Lockfile-first layer for cache.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The app calls relative /api paths; nginx proxies them to the backend at runtime,
# so no build-time API URL is needed.

RUN npm run build

# ---------- runtime stage: nginx static + reverse proxy ----------
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=4s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
