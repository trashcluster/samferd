# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/src ./src
COPY frontend/index.html ./
COPY frontend/vite.config.js ./

RUN npm run build

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Install simple HTTP server to serve built files
RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
