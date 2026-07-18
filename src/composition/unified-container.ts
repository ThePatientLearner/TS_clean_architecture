/**
 * composition/unified-container.ts — Composition Root "unificado".
 *
 * Es el ÚNICO container que usa main.ts. Decide en tiempo de arranque
 * qué container concreto construir según `config.DATABASE_TYPE`:
 *
 *   DATABASE_TYPE=memory    → buildContainer() (sin BD real)
 *   DATABASE_TYPE=postgres  → buildPostgresContainer() + extras para el server
 *
 * Devuelve un objeto que satisface `ServerDependencies` (lo que el server HTTP
 * necesita) + una función `cleanup()` para el graceful shutdown.
 *
 * ¿Por qué existe este "puente"? Porque el server HTTP siempre espera los
 * MISMOS use cases (CreateOrder, AddItemToOrder). Pero el container Postgres
 * solo expone CreateOrderWithUoW (porque trabaja con UoW). Este archivo se
 * encarga de "completar" lo que falta y de "rebindear" execute() para que
 * el server no note la diferencia.
 *
 * Truco TS: `null as any` se usa para saltarse momentáneamente la validación
 * de tipos cuando vamos a sobreescribir el método justo después. Es feo, pero
 * a veces es la forma pragmática de no liar más la arquitectura.
 */
import { config, useInMemoryDatabase, usePostgresDatabase } from './config.js'
import { buildContainer } from './container.js'
import { buildPostgresContainer, closeContainer as closePostgresContainer } from './postgres-container.js'
import { StaticPricingService } from '../infrastructure/http/StaticPricingService.js'
import { AddItemToOrder } from '../application/use-cases/add-item-to-order.js'
import { CreateOrder } from '../application/use-cases/create-order.js'
import { MessagingFactory } from '../infrastructure/messaging/messaging-factory.js'
import { ServerDependencies } from '../application/ports/server-dependencies.js'
import { PinoLogger } from '../infrastructure/logging/pino-logger.js'
import { DatabaseFactory } from '../infrastructure/database/database-factory.js'
import { PostgresOrderRepository } from '../infrastructure/persistence/postgres/postgres-order-repository.js'

/** Forma que devuelve buildUnifiedContainer: deps del server + función de cleanup. */
export interface UnifiedDependencies extends ServerDependencies {
  /** (Opcional) Función para liberar recursos. En memoria es no-op; en Postgres cierra el pool. */
  cleanup?: () => Promise<void>
}

/**
 * Construye el contenedor adecuado en función de `DATABASE_TYPE`.
 * Lanza Error si el tipo no es soportado (zod ya validó antes que solo sea 'memory' | 'postgres').
 */
export function buildUnifiedContainer(): UnifiedDependencies {
  // Logger propio del container para loguear la decisión antes de tener el
  // logger "real" del container concreto.
  const logger = new PinoLogger()

  // ── Modo memoria ───────────────────────────────────────────────────────
  if (useInMemoryDatabase()) {
    logger.info('Using in-memory database')
    const dependencies = buildContainer()

    return {
      ...dependencies, // spread: copia todas las props de `dependencies`
      logger,
      cleanup: async () => {
        logger.info('Cleaning up in-memory dependencies')
        // No hay nada que cerrar (no hay conexiones abiertas).
      }
    }
  }

  // ── Modo Postgres ──────────────────────────────────────────────────────
  if (usePostgresDatabase()) {
    logger.info('Using PostgreSQL database')
    const postgresDependencies = buildPostgresContainer()

    // Creamos las dependencias que faltan para que el server tenga todo lo
    // que necesita (ServerDependencies), pero usando implementaciones de BD real.
    const pricingService = new StaticPricingService()
    // MessagingFactory decide qué EventBus: 'outbox' (persiste en tabla outbox)
    // o 'noop' (no hace nada). Aquí usamos 'outbox' para producción.
    const eventBus = MessagingFactory.createEventBus('outbox')

    // Creamos un PostgresOrderRepository "compartido" para operaciones que
    // NO van por UoW (como AddItemToOrder). Reutilizamos el Pool del factory.
    const pool = DatabaseFactory.createPool()
    // `as any` evita el conflicto de tipos entre PoolClient y Pool del repo.
    const orderRepository = new PostgresOrderRepository(pool as any)

    // AddItemToOrder funciona con el repo "normal" (sin transacción explícita).
    const addItemToOrderUseCase = new AddItemToOrder(
      orderRepository,
      pricingService,
      eventBus
    )

    // Adapter: reutilizamos la clase CreateOrder para que el controller
    // pueda llamarla igual, pero le "robamos" el execute() del UoW.
    const createOrderUseCase = new CreateOrder(
      null as any, // no usamos el repo directo, va por UoW
      eventBus
    )
    // Sustituimos el método execute por el del caso transaccional.
    // `.bind(...)` fija el `this` para que `this.eventBus` siga apuntando al original.
    createOrderUseCase.execute = postgresDependencies.createOrderUseCase.execute.bind(postgresDependencies.createOrderUseCase)

    return {
      createOrderUseCase,
      addItemToOrderUseCase,
      logger: postgresDependencies.logger,
      cleanup: async () => {
        logger.info('Cleaning up PostgreSQL dependencies')
        // Cierra el Pool para no dejar conexiones colgadas.
        await closePostgresContainer()
      }
    }
  }

  // zod ya validó DATABASE_TYPE, así que este throw es defensivo.
  throw new Error(`Unsupported database type: ${config.DATABASE_TYPE}`)
}