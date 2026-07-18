/**
 * domain/events/domain-event.ts — Clase base de todos los eventos de dominio.
 *
 * Un DomainEvent representa "algo que ocurrió en el pasado" en el dominio.
 * Características:
 *  - Es inmutable (`readonly` en sus campos).
 *  - Lleva `aggregateId` (a qué entidad se refiere) y `occurredOn` (cuándo ocurrió).
 *  - Es `abstract`: no instancias DomainEvent directamente, sino una subclase
 *    concreta (OrderCreated, ItemAddedToOrder, etc.).
 *
 * Estos eventos se generan al ejecutar métodos de las entidades (p.ej. Order.addItem)
 * y se "publican" después a través del EventBus (ver application/ports/event-bus.ts).
 * Permiten reaccionar a cambios sin acoplar capas (p.ej. enviar email, log, integración).
 */
export abstract class DomainEvent {
  // `readonly` → solo se asigna en el constructor; luego no se puede cambiar.
  readonly occurredOn: Date
  readonly aggregateId: string

  /**
   * @param aggregateId - Identificador del agregado al que pertenece el evento.
   */
  constructor(aggregateId: string) {
    this.aggregateId = aggregateId
    // Capturamos el momento del evento. Importante: no se debería pasar `new Date()`
    // desde fuera para mantener consistencia (en tests se inyecta un Clock).
    this.occurredOn = new Date()
  }
}