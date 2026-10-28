# Base Node image
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dependencies stage
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* ./
# pnpm aur npm dono fallback support
RUN if [ -f pnpm-lock.yaml ]; then \
  corepack enable pnpm && pnpm install --frozen-lockfile; \
  else \
  npm install; \
  fi

# Runner stage (Single clean stage for production)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Security: Non-root user setup
RUN addgroup --system --gid 1001 nodejs && \
  adduser --system --uid 1001 appuser

# Dependencies copy
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# Source files copy (.dockerignore host ke node_modules ko aane se rokega)
COPY . .

# Ownership setup
RUN chown -R appuser:nodejs /app
USER appuser

# Port environment variable render dashboard se lega, fallback 8000
ENV PORT=8000
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

CMD ["node", "index.js"]