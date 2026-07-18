/**
 * infrastructure/messaging/messaging-factory.ts — Factory de EventBus.
 *
 * Pequeño helper que decide qué implementación de EventBus instanciar
 * según el parámetro `type`. Sirve para tener un único punto de creación
 * (Composition Root) en lugar de `new ...` esparcidos por el código.
 *
 *   type='outbox' → OutboxEventBus (persiste eventos en tabla outbox)
 *   type='noop'   → NoopEventBus    (no hace nada)
 *
 * Ambos usan el Pool del DatabaseFactory (Singleton).
 */
import { EventBus } from '../../application/ports/event-bus.js'
import { OutboxEventBus } from './outbox-event-bus.js'
import { NoopEventBus } from './NoopEventBus.js'
import { OutboxDispatcher } from './outbox-dispatcher.js'
import { DatabaseFactory } from '../database/database-factory.js'

export class MessagingFactory {
  /**
   * @param type Tipo de bus a crear. Default 'outbox'.
   * @returns Una implementación del puerto `EventBus`.
   */
  static createEventBus(type: 'outbox' | 'noop' = 'outbox'): EventBus {
    if (type === 'noop') {
      return new NoopEventBus()
    }

    // 'outbox' → usa el pool compartido del DatabaseFactory.
    const pool = DatabaseFactory.createPool()
    return new OutboxEventBus(pool)
  }

  /**
   * Convenience para crear un OutboxDispatcher con tamaño de batch e intervalo
   * personalizados. Lo usa `unified-container.ts` si en algún momento quieres
   * arrancar el dispatcher desde el proceso principal.
   */
  static createOutboxDispatcher(batchSize = 100, intervalMs = 5000): OutboxDispatcher {
    return new OutboxDispatcher(batchSize, intervalMs)
  }
}