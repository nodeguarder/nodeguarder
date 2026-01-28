# Customer image for NodeGuarder
# Build with: docker build -t nodeguarder:latest .

ARG VERSION=1.0.1

# Agent Build Stage
FROM golang:1.21-alpine AS agent-builder
ARG VERSION
WORKDIR /src/agent

# Install dependencies for BPF compilation
RUN apk add --no-cache clang llvm make git linux-headers libbpf-dev

COPY agent .

# Ensure dependencies are tidy (since we edited go.mod manually)
RUN go mod tidy

# Generate BPF artifacts (requires clang)
# We assume the agent code has 'go:generate' directives
RUN go generate ./... && ls -la ebpf && cat ebpf/*_bpfel.go | head -n 20

# Build for AMD64
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w -X main.Version=${VERSION}" -o /out/nodeguarder-agent-linux-amd64 .
# Build for ARM64
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w -X main.Version=${VERSION}" -o /out/nodeguarder-agent-linux-arm64 .

# Frontend stage
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend files
COPY dashboard/frontend/package*.json ./

# Install dependencies
RUN rm -f package-lock.json && npm install

# Copy source code
COPY dashboard/frontend .

# Build with License Generator (Configurable via ARG)
ARG INCLUDE_LICENSE_GENERATOR=false
RUN VITE_INCLUDE_LICENSE_GENERATOR=${INCLUDE_LICENSE_GENERATOR} npm run build

# Backend stage
FROM golang:1.21-alpine AS backend-builder

RUN apk add --no-cache gcc musl-dev sqlite-dev

WORKDIR /app/backend

COPY dashboard/backend/go.mod dashboard/backend/go.sum ./

RUN go mod tidy

COPY dashboard/backend .

RUN go mod tidy

# Build backend
ARG GO_BUILD_TAGS=""
RUN CGO_ENABLED=1 GOOS=linux go build -tags "${GO_BUILD_TAGS}" -o nodeguarder-backend .

# Final stage
FROM alpine:latest
ARG VERSION

RUN apk --no-cache add ca-certificates sqlite

WORKDIR /app

# Copy backend binary
COPY --from=backend-builder /app/backend/nodeguarder-backend .

# Copy public key
COPY --from=backend-builder /app/backend/public.key ./public.key

# Copy frontend dist
COPY --from=frontend-builder /app/frontend/dist ./frontend

# Copy Agent Binaries (Embedded)
COPY --from=agent-builder /out/nodeguarder-agent-linux-amd64 ./agent-binaries/nodeguarder-agent-linux-amd64
COPY --from=agent-builder /out/nodeguarder-agent-linux-arm64 ./agent-binaries/nodeguarder-agent-linux-arm64

# Create data directory
RUN mkdir -p /data

# License encryption key (set at runtime if needed)
ENV LICENSE_ENCRYPTION_KEY=""
ENV DB_PATH="/data/nodeguarder.db"
ENV PORT="8080"
ENV AGENT_BINARY_PATH="/app/agent-binaries"
# Inject Version
ENV AGENT_VERSION=${VERSION}

# DISABLE License Generator for customer image
ENV INCLUDE_LICENSE_GENERATOR="false"

EXPOSE 8080

CMD ["./nodeguarder-backend"]
