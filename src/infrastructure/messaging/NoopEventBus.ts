/**
 * infrastructure/messaging/NoopEventBus.ts — EventBus "no operation".
 *
 * Implementación vacía del puerto `EventBus`. Sirve para:
 *   - Modo memoria (no hay broker externo, así que "publicar" = no hacer nada).
 *   - Tests donde no queremos que se ejecute ninguna lógica de eventos.
 *
 * Como no puede fallar, devuelve siempre `ok(undefined)`.
 *
 * Fíjate en `_events`: el `_` inicial en TS es una convención para decir
 * "parámetro no usado" (y silenciar el warning de noUnusedParameters del tsconfig).
 */
import { DomainEvent } from '../../domain/events/domain-event.js'
import { Result, ok } from '../../shared/result.js'
import { EventBus } from '../../application/ports/event-bus.js'
import { AppError } from '../../application/errors.js'

export class NoopEventBus implements EventBus {
  async publish(_events: DomainEvent[]): Promise<Result<void, AppError>> {
    return ok(undefined)
  }
}