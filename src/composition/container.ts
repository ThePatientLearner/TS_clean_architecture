/**
 * composition/container.ts — Composition Root para modo "memoria".
 *
 * Esta es la implementación "simple": toda la infraestructura es in-memory
 * (sin BD, sin red). Ideal para desarrollo rápido, demos o tests que no
 * necesiten persistencia real.
 *
 * El "Composition Root" es el ÚNICO sitio donde se instancian clases
 * concretas y se "cablean" entre sí. El resto del código solo conoce
 * interfaces (puertos), nunca `new InMemoryOrderRepository()` directamente.
 *
 * Flujo:
 *   1. Crear adaptadores (lado infraestructura):
 *      - InMemoryOrderRepository  (implementa OrderRepository)
 *      - StaticPricingService    (implementa PricingService)
 *      - NoopEventBus            (implementa EventBus, no hace nada)
 *      - PinoLogger              (implementa Logger)
 *   2. Crear casos de uso (lado aplicación) inyectándoles los adaptadores.
 *   3. Devolver un objeto con todo: el server usará las propiedades que necesita.
 *
 * Para la versión Postgres existe `postgres-container.ts` y un dispatcher
 * (`unified-container.ts`) que elige uno u otro según `DATABASE_TYPE`.
 */
import { InMemoryOrderRepository } from '../infrastructure/persistence/in-memory/in-memory-order-repository.js'
import { StaticPricingService } from '../infrastructure/http/StaticPricingService.js'
import { NoopEventBus } from '../infrastructure/messaging/NoopEventBus.js'
import { PinoLogger } from '../infrastructure/logging/pino-logger.js'
import { CreateOrder } from '../application/use-cases/create-order.js'
import { AddItemToOrder } from '../application/use-cases/add-item-to-order.js'
import { OrderRepository } from '../application/ports/order-repository.js'
import { PricingService } from '../application/ports/pricing-service.js'
import { EventBus } from '../application/ports/event-bus.js'
import { Logger } from '../application/ports/logger.js'
import { ServerDependencies } from '../application/ports/server-dependencies.js'

/**
 * `Dependencies` extiende `ServerDependencies` (lo que el server necesita)
 * y además expone los puertos para que los use cases internos (como
 * AddItemToOrder) puedan usarlos desde otros lugares si hace falta.
 *
 * En TypeScript, `extends` en interfaces copia todas las propiedades del padre.
 */
export interface Dependencies extends ServerDependencies {
  // Puertos (interfaces) expuestos tal cual para reutilización.
  orderRepository: OrderRepository
  pricingService: PricingService
  eventBus: EventBus
  logger: Logger
}

/**
 * Construye y devuelve el grafo completo de dependencias para modo memoria.
 * Se llama una sola vez al arrancar la app (en main.ts).
 */
export function buildContainer(): Dependencies {
  // ── Infraestructura (adaptadores concretos) ─────────────────────────────
  const orderRepository = new InMemoryOrderRepository()
  const pricingService = new StaticPricingService()
  const eventBus = new NoopEventBus()
  const logger = new PinoLogger()

  // ── Aplicación (casos de uso con sus dependencias inyectadas) ──────────
  // Fíjate: CreateOrder recibe el repo y el bus directamente (no el UoW).
  // Esta versión es "sin transacción": cada save es independiente.
  const createOrderUseCase = new CreateOrder(orderRepository, eventBus)
  const addItemToOrderUseCase = new AddItemToOrder(orderRepository, pricingService, eventBus)

  return {
    // Puertos (por si algún consumidor quiere acceder directamente)
    orderRepository,
    pricingService,
    eventBus,
    logger,

    // Casos de uso (lo que usa el controller HTTP)
    createOrderUseCase,
    addItemToOrderUseCase
  }
}