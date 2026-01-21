# SmartMetal Backend - Production Dockerfile
# Optimized for Google Cloud Run deployment

# Stage 1: Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Stage 2: Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install system dependencies for native modules (bcrypt, etc.)
RUN apk add --no-cache python3 make g++

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Remove build dependencies to reduce image size
RUN apk del python3 make g++

# Copy application code from builder
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Create non-root user for security (Cloud Run best practice)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Cloud Run uses PORT env var (default 8080, but we'll use 4000)
ENV PORT=8080
EXPOSE 8080

# Health check (Cloud Run handles this via HTTP, but useful for local testing)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
