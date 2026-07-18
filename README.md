# Clean Orders (TypeScript)

Proyecto de ejemplo que aplica **Clean Architecture** + **DDD** en TypeScript.
Implementa una API de pedidos con dos backends intercambiables: en memoria
(para dev/test) y PostgreSQL con Unit of Work y patrón Outbox.

## Capas y dependencias

La regla de oro: **las dependencias apuntan hacia adentro**. Una capa interna
NO sabe nada de las externas.

```
┌──────────────────────────────────────────────────────────────┐
│  infrastructure/                                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │ http/            │  │ persistence/     │                 │
│  │  server.ts       │  │  in-memory/      │  logging/       │
│  │  controllers/    │  │  postgres/       │  messaging/     │
│  │  plugins/        │  │ database-factory │  http/          │
│  └──────────────────┘  └──────────────────┘                 │
│         ▲                     ▲                             │
│         │ implements ports    │                             │
│         │                     │                             │
├─────────┴─────────────────────┴─────────────────────────────┤
│  application/                                                │
│  ┌────────────────────────────┐  ┌────────────────────┐    │
│  │ use-cases/                 │  │ ports/             │    │
│  │  create-order.ts           │  │  order-repository  │    │
│  │  add-item-to-order.ts      │←→│  pricing-service   │    │
│  │  create-order-with-uow.ts  │  │  event-bus         │    │
│  │                            │  │  logger, clock     │    │
│  │ dto/, errors.ts            │  │  unit-of-work      │    │
│  └────────────────────────────┘  └────────────────────┘    │
│         ▲                                                    │
│         │ usa entidades + VOs + eventos                       │
│         │                                                    │
├─────────┴────────────────────────────────────────────────────┤
│  domain/                                                     │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ entities/           │  │ value-objects/              │  │
│  │  order.ts           │←→│  sku, quantity, currency,    │  │
│  │                     │  │  money, order-item          │  │
│  └─────────────────────┘  └─────────────────────────────┘  │
│              ▲                                              │
│              │ domain/events/                               │
│              │  domain-event.ts                             │
│              │  order-created.ts                            │
│              │  item-added-to-order.ts                      │
└──────────────────────────────────────────────────────────────┘

         ▲
         │ inyecta todo
         │
┌────────┴────────────────────────────────────────────────────┐
│  composition/                                                │
│   config.ts                ← valida .env con Zod            │
│   container.ts             ← wiring modo memoria             │
│   postgres-container.ts    ← wiring modo Postgres            │
│   unified-container.ts     ← elige uno u otro (entry point)  │
└──────────────────────────────────────────────────────────────┘

         ▲
         │ arranca
         │
┌────────┴────────┐
│   main.ts       │   ← arranque + graceful shutdown
└─────────────────┘
```

**Resumen de qué contiene cada capa:**

| Capa | Qué hace | Qué conoce |
|---|---|---|
| `domain/` | Reglas de negocio puras | Nada externo (ni HTTP, ni BD, ni logs) |
| `application/` | Casos de uso, orquesta el dominio | Los `ports/` (interfaces), no implementaciones |
| `infrastructure/` | Adaptadores: Fastify, Postgres, Pino, Outbox | Las interfaces de `application/ports/` |
| `composition/` | Composition Root: cablea todo | Todas (es el único sitio que conoce implementaciones) |
| `main.ts` | Arranque + shutdown | Solo el container unificado |

## Quick start

```bash
# 1. Instalar dependencias
npm install

# 2. (Opcional) Copiar variables de entorno
cp .env.example .env

# 3. Modo memoria (sin BD, ideal para empezar)
npm run dev

# 4. Modo Postgres (requiere docker compose up + migraciones)
npm run db:up
npm run db:migrate
DATABASE_TYPE=postgres npm run dev

# 5. (Opcional) Worker del Outbox en otro proceso
npm run worker:outbox
```

Servidor por defecto en `http://localhost:3000`.

## Endpoints

### `GET /health`
Health check simple.

```bash
curl http://localhost:3000/health
# → {"status":"ok","timestamp":"2025-..."}
```

### `POST /orders`
Crea un pedido nuevo. **Falla con 409 si el SKU ya existe.**

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"orderSku": "PED-001"}'
# → 201 {"message":"Order created successfully"}
```

Errores posibles:
- `400 VALIDATION_ERROR` — el SKU es vacío o tiene menos de 3 chars
- `409 CONFLICT_ERROR` — ya existe un pedido con ese SKU
- `503 INFRA_ERROR` — fallo de BD

### `POST /orders/:orderSku/items`
Añade (o incrementa) un producto en un pedido existente.

```bash
curl -X POST http://localhost:3000/orders/PED-001/items \
  -H "Content-Type: application/json" \
  -d '{"productSku": "LAPTOP-001", "quantity": 2}'
# → 200 {"message":"Item added successfully"}
```

Si vuelves a llamar con el mismo `productSku`, **se incrementa la cantidad**
(no se duplica la línea), siempre que el precio sea el mismo.

Errores posibles:
- `400 VALIDATION_ERROR` — SKU vacío, quantity ≤ 0 o no entero, precio distinto al existente
- `404 NOT_FOUND_ERROR` — el pedido no existe o el producto no está en el catálogo
- `503 INFRA_ERROR` — fallo de BD

## Catálogo hardcoded de productos

`StaticPricingService` expone estos precios por SKU:

| SKU | Precio | Moneda |
|---|---|---|
| LAPTOP-001 | 999.99 | USD |
| MOUSE-001 | 29.99 | USD |
| KEYBOARD-001 | 79.99 | USD |
| MONITOR-001 | 299.99 | USD |
| HEADPHONES-001 | 149.99 | USD |
| TABLET-001 | 499.99 | EUR |
| PHONE-001 | 799.99 | EUR |
| SPEAKER-001 | 89.99 | GBP |

Cualquier otro SKU devuelve 404.

## Flujo end-to-end de un `POST /orders`

```
HTTP request
   │
   ▼
OrderController.createOrder        (infrastructure/http/controllers/)
   │  parsea body, crea child logger con requestId
   │  construye CreateOrderDto
   ▼
CreateOrder.execute(dto)           (application/use-cases/)
   │  new SKU(...)             ← valida SKU (mín. 3 chars)
   │  orderRepository.findById ← consulta via OrderRepository (port)
   │     │
   │     ▼
   │  InMemoryOrderRepository  o  PostgresOrderRepository
   │                            (infrastructure/persistence/)
   │  new Order(sku)           ← emite OrderCreated
   │  orderRepository.save(order)
   │  eventBus.publish(events) ← via EventBus (port)
   │     │
   │     ▼
   │  NoopEventBus  o  OutboxEventBus (inserta en tabla outbox)
   │                            (infrastructure/messaging/)
   │
   ▼
Result<void, AppError>            (shared/result.ts)
   │
   ▼
OrderController mapea el Result a HTTP:
   success            → 201
   VALIDATION_ERROR   → 400
   NOT_FOUND_ERROR    → 404
   CONFLICT_ERROR     → 409
   INFRA_ERROR        → 503
```

## Conceptos clave

### Value Objects (inmutables, validadores)
`SKU`, `Money`, `Currency`, `Quantity`, `OrderItem`. Validan en el constructor:
si llegan datos inválidos, lanzan error en lugar de dejar valores rotos circular.

### Aggregate Root (Order)
Mantiene su propia lista de items y la cola de eventos. Una vez creada,
solo emite eventos: nunca expone setters que muten estado sin emitir.

### Result<T, E> en vez de excepciones
Los casos de uso devuelven `Result<T, AppError>`. El caller (controller) decide
cómo mapear el error a HTTP. Hace el flujo de error **explícito en el tipo**.

### Ports & Adapters (Inversión de Dependencias)
La aplicación define `OrderRepository`, `PricingService`, `EventBus`, `Logger`
como **interfaces**. La infraestructura provee implementaciones concretas
(Postgres, en memoria, Pino, Outbox...). Cambiar la BD o el logger no toca
los casos de uso.

### Composition Root
Único sitio que conoce implementaciones concretas:
- `src/composition/container.ts` — modo memoria
- `src/composition/postgres-container.ts` — modo Postgres
- `src/composition/unified-container.ts` — elige según `DATABASE_TYPE`

### Unit of Work (solo modo Postgres)
`PgUnitOfWork` envuelve una operación en `BEGIN/COMMIT/ROLLBACK` y le pasa
al callback repositorios que comparten la transacción. Ver `CreateOrderWithUoW`.

### Patrón Outbox
Para evitar el problema clásico "persistí el pedido pero no pude publicar
el evento al broker":
1. `OutboxEventBus` inserta los eventos en la tabla `outbox` en la misma
   transacción que el pedido.
2. `OutboxDispatcher` (worker aparte, `npm run worker:outbox`) lee esa tabla
   periódicamente, publica al broker real y marca `published_at`.

## Tests

```bash
npm test             # corre una vez
npm run test:watch   # modo watch
```

(Los tests usan `vitest`, configuración en `vitest.config.ts`.)

## Estructura de carpetas

```
.
├── main.ts                    ← arranque
├── src/
│   ├── shared/                ← tipos/utilidades transversales (Result)
│   ├── domain/                ← entidades, VOs, eventos (sin dependencias)
│   ├── application/           ← casos de uso, puertos, DTOs, errores
│   ├── infrastructure/        ← adaptadores (HTTP, BD, logs, eventos)
│   ├── composition/           ← DI / wiring / config
│   └── examples/              ← demos ejecutables del logger y el outbox
├── scripts/
│   └── migrate.ts             ← CLI de migraciones SQL
├── db/
│   └── migrations/            ← archivos SQL versionados
└── tests/                     ← tests (vitest)
```

## Variables de entorno

Ver `.env.example` y `DEPLOYMENT.md`. Las mínimas:

| Variable | Valores | Default |
|---|---|---|
| `NODE_ENV` | `development`, `production`, `test` | `development` |
| `PORT` | 1-65535 | `3000` |
| `DATABASE_TYPE` | `memory`, `postgres` | `memory` |
| `DATABASE_URL` | URL postgres (obligatoria si `DATABASE_TYPE=postgres`) | — |
| `LOG_LEVEL` | `trace`..`fatal` | `info` |
| `LOG_PRETTY` | `true`, `false` | `true` |# TS_clean_architecture
