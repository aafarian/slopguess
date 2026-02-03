# ---- Build Stage ----
# Build context: project root (set via docker-compose)
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files for dependency caching
COPY server/package.json server/package-lock.json* ./

# Install all dependencies (including devDependencies needed for tsc build)
RUN npm ci

# Copy tsconfig.base.json from project root (server/tsconfig.json extends ../tsconfig.base.json)
COPY tsconfig.base.json /tsconfig.base.json

# Copy server source code and config
COPY server/tsconfig.json ./
COPY server/src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# ---- Production Stage ----
FROM node:18-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Copy package files
COPY server/package.json server/package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JavaScript from build stage
COPY --from=builder /app/dist ./dist

# Copy SQL migration files (not handled by tsc)
COPY server/src/db/migrations/ ./dist/db/migrations/

# Create public directory for persisted images (volume mount target)
# Must exist before chown so appuser can write to it
RUN mkdir -p /app/public/images

# Set ownership to non-root user
RUN chown -R appuser:appgroup /app

# Copy entrypoint script
COPY server/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER appuser

# Expose server port
EXPOSE 3001

# Health check against the API health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/index.js"]
