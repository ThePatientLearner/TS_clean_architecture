/**
 * composition/postgres-container.ts — Composition Root para modo "Postgres".
 *
 * Variante del container que cablea la infraestructura con base de datos real.
 * A diferencia del container en memoria, aquí usamos:
 *   - DatabaseFactory          → crea el Pool de conexiones a Postgres.
 *   - PgUnitOfWork             → implementa UnitOfWork (BEGIN/COMMIT/ROLLBACK).
 *   - CreateOrderWithUoW       → caso de uso transaccional.
 *
 * Fíjate que aquí SOLO exponemos `createOrderUseCase`. ¿Por qué?
 * Porque el proyecto principal (unified-container.ts) se encarga de "rellenar"
 * el resto (AddItemToOrder, pricing, event bus, etc.) para mantener una
 * interfaz común con el container en memoria.
 */
import { StaticPricingService } from '../infrastructure/http/StaticPricingService.js';
import { NoopEventBus } from '../infrastructure/messaging/NoopEventBus.js';
import { PinoLogger } from '../infrastructure/logging/pino-logger.js';
import { CreateOrderWithUoW } from '../application/use-cases/create-order-with-uow.js';
import { PricingService } from '../application/ports/pricing-service.js';
import { EventBus } from '../application/ports/event-bus.js';
import { Logger } from '../application/ports/logger.js';
import { UnitOfWork } from '../application/ports/unit-of-work.js';
import { DatabaseFactory } from '../infrastructure/database/database-factory.js';

/** Forma del contenedor en modo Postgres (más reducida que en memoria). */
export interface PostgresDependencies {
  // Puertos
  unitOfWork: UnitOfWork;
  pricingService: PricingService;
  eventBus: EventBus;
  logger: Logger;

  // Casos de uso
  createOrderUseCase: CreateOrderWithUoW;
}

/**
 * Construye el grafo de dependencias para Postgres.
 * Importante: DatabaseFactory es un Singleton, así que crear el Pool varias
 * veces devuelve la MISMA instancia (no se abren pools duplicados).
 */
export function buildPostgresContainer(): PostgresDependencies {
  // Infraestructura
  const unitOfWork = DatabaseFactory.createUnitOfWork();
  const pricingService = new StaticPricingService();
  const eventBus = new NoopEventBus();
  const logger = new PinoLogger();

  // Caso de uso transaccional
  const createOrderUseCase = new CreateOrderWithUoW(unitOfWork, eventBus);

  return {
    unitOfWork,
    pricingService,
    eventBus,
    logger,
    createOrderUseCase,
  };
}

/**
 * Cierra el pool de conexiones a Postgres. Se llama en el graceful shutdown
 * (SIGTERM/SIGINT) para no dejar conexiones abiertas.
 */
export async function closeContainer(): Promise<void> {
  await DatabaseFactory.closePool();
}