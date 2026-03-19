# Multi-stage Dockerfile for NoteMind

# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

# Install build dependencies for frontend (if needed)
RUN apk add --no-cache python3 make g++

WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Backend Runtime
FROM node:20-alpine AS backend

WORKDIR /app

# Install build dependencies for canvas native compilation
RUN apk add --no-cache --virtual .build-deps \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Install runtime dependencies for canvas
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib

# Install production dependencies
COPY server/package*.json ./
RUN npm install --omit=dev

# Remove build dependencies to reduce image size
RUN apk del .build-deps

# Copy server code
COPY server/ ./

# Copy built frontend
COPY --from=frontend-builder /app/client/dist ./public

# Create necessary directories
RUN mkdir -p data uploads exports logs uploads/avatars

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "index.js"]
