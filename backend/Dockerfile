# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Build application
COPY backend/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o samferd cmd/main.go

# Runtime stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/samferd .

EXPOSE 8080

CMD ["./samferd"]
