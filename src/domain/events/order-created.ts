/**
 * domain/events/order-created.ts — Evento "se ha creado un pedido".
 *
 * Se dispara cuando un nuevo `Order` se instancia (en `new Order(sku)`).
 * No lleva payload adicional porque el "qué" del evento ya está implícito
 * en su nombre. El `aggregateId` (heredado) es el SKU del pedido.
 */
import { DomainEvent } from './domain-event.js'

export class OrderCreated extends DomainEvent {
  /**
   * @param orderSku - SKU del pedido recién creado (será el aggregateId).
   */
  constructor(orderSku: string) {
    // Llama al constructor de DomainEvent, que asigna aggregateId y occurredOn.
    super(orderSku)
  }
}