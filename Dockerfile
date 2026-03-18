# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies in a separate layer for caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY api/   ./api/
COPY mcp/   ./mcp/

EXPOSE 3001

# Healthcheck so Docker Compose can wait for readiness
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "api/server.js"]
