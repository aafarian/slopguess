# ---- Build Stage ----
# Build context: project root (set via docker-compose)
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY client/package.json client/package-lock.json* ./

# Install all dependencies (including devDependencies needed for vite/tsc)
RUN npm ci

# Copy client source code and config
COPY client/tsconfig.json client/tsconfig.app.json client/tsconfig.node.json client/vite.config.ts client/index.html ./
COPY client/src/ ./src/
COPY client/public/ ./public/

# Build the client (TypeScript check + Vite production build)
RUN npm run build

# ---- Production Stage ----
FROM nginx:1.25-alpine AS production

# Copy custom nginx configuration
COPY client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
