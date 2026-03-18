# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies in a separate layer for caching
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY api/   ./api/
COPY mcp/   ./mcp/

# Pre-create the uploads directory so the volume mount lands in the right place.
# The app also does mkdir({ recursive: true }) at startup, but this makes the
# directory ownership correct when the volume is first initialised.
RUN mkdir -p /app/uploads/receipts

EXPOSE 3001

# Healthcheck so Docker Compose can wait for readiness
HEALTHCHECK --interval=5s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "api/server.js"]
