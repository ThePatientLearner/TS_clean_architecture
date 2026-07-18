# Deployment Configuration

This document describes how to configure and deploy the Clean Orders application with different database backends and logging settings.

## Environment Configuration

The application uses environment variables for configuration. Copy `.env.example` to `.env` and modify as needed:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Options | Description | Default |
|----------|---------|-------------|---------|
| `NODE_ENV` | `development`, `production`, `test` | Runtime environment | `development` |
| `PORT` | `1-65535` | HTTP server port | `3000` |
| `DATABASE_TYPE` | `memory`, `postgres` | Database backend | `memory` |

### Database Configuration

#### In-Memory Database (Development)
```bash
NODE_ENV=development
DATABASE_TYPE=memory
```

#### PostgreSQL (Production)
```bash
NODE_ENV=production
DATABASE_TYPE=postgres
DATABASE_URL=postgresql://username:password@localhost:5432/clean_orders
```

### Logging Configuration

| Variable | Options | Description | Default |
|----------|---------|-------------|---------|
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` | Minimum log level | `info` |
| `LOG_PRETTY` | `true`, `false` | Pretty print logs (dev) | `true` |

### Outbox Worker Configuration

| Variable | Type | Description | Default |
|----------|------|-------------|---------|
| `OUTBOX_WORKER_INTERVAL_MS` | `number` | Worker polling interval (ms) | `5000` |

## Running the Application

### Development (In-Memory)
```bash
# Uses in-memory database
npm run dev
```

### Production (PostgreSQL)
```bash
# Requires PostgreSQL running and DATABASE_URL configured
DATABASE_TYPE=postgres npm run dev
```

### Database Setup (PostgreSQL)
```bash
# Start PostgreSQL
npm run db:up

# Run migrations
npm run db:migrate

# Start application
DATABASE_TYPE=postgres npm run dev

# Start outbox worker (separate process)
npm run worker:outbox
```

## Application Lifecycle

The application implements graceful shutdown handling:

- **SIGTERM/SIGINT**: Gracefully closes HTTP server and database connections
- **Unhandled Rejections**: Logged and handled appropriately  
- **Uncaught Exceptions**: Logged with cleanup before exit

### Cleanup Process

1. Close HTTP server (stop accepting new connections)
2. Close database connections and pools
3. Flush logs and cleanup resources
4. Exit process

## Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Log Format
All logs include structured context:
- `requestId`: Unique identifier per request
- `method`, `url`: HTTP request details
- `operation`: Business operation being performed
- `responseTimeMs`: Request duration
- `statusCode`: HTTP response status

### Example Log Output
```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.123Z",
  "requestId": "req-uuid-123",
  "method": "POST",
  "url": "/orders",
  "operation": "createOrder",
  "orderSku": "order-456",
  "msg": "Order created successfully"
}
```

## Architecture Overview

The application automatically selects the appropriate implementation based on `DATABASE_TYPE`:

### Memory Mode (`DATABASE_TYPE=memory`)
- In-memory repositories
- NoOp event bus
- Fast startup, no persistence
- Ideal for development and testing

### PostgreSQL Mode (`DATABASE_TYPE=postgres`)
- PostgreSQL repositories with Unit of Work
- Outbox pattern event bus
- Full persistence and transactional consistency
- Production ready

Both modes share the same business logic and HTTP interface, ensuring consistency across environments.