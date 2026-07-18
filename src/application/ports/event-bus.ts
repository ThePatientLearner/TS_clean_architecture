/**
 * application/ports/event-bus.ts — Puerto "EventBus".
 *
 * Encargado de "publicar" DomainEvents para que otros sistemas reaccionen
 * (notificaciones, integración, proyecciones, etc.).
 *
 * ¿Por qué un puerto? Porque hay dos implementaciones:
 *  - NoopEventBus: en memoria, no hace nada (útil para tests / modo memory).
 *  - OutboxEventBus: persiste eventos en la tabla `outbox` para publicarlos
 *    de forma fiable más tarde (patrón Outbox, ver infrastructure/messaging/).
 *
 * Como el resto, devuelve Result en vez de lanzar: si falla la publicación,
 * el caller decide qué hacer.
 */
import { DomainEvent } from '../../domain/events/domain-event.js'
import { Result } from '../../shared/result.js'
import { AppError } from '../errors.js'

export interface EventBus {
  /**
   * Publica un lote de eventos.
   * @returns Ok(void) si se publicaron; Err(AppError) si falló la infraestructura.
   */
  publish(events: DomainEvent[]): Promise<Result<void, AppError>>
}