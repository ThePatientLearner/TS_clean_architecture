/**
 * domain/events/item-added-to-order.ts — Evento "se ha añadido un item a un pedido".
 *
 * Se dispara desde `Order.addItem(...)` cada vez que se añade (o incrementa)
 * un producto en un pedido. Lleva el detalle para que los consumidores del
 * evento (p.ej. un handler que actualiza stock o envía notificación) tengan
 * toda la información sin tener que volver a leer la BD.
 */
import { DomainEvent } from './domain-event.js'

export class ItemAddedToOrder extends DomainEvent {
  // Campos del payload del evento. `readonly` para que sea inmutable tras construirse.
  readonly productSku: string
  readonly quantity: number
  readonly unitPrice: number
  readonly currency: string

  /**
   * @param orderSku   - SKU del pedido (será el aggregateId heredado).
   * @param productSku - SKU del producto añadido.
   * @param quantity   - Cantidad añadida.
   * @param unitPrice  - Precio unitario aplicado.
   * @param currency   - Código de moneda del precio.
   */
  constructor(
    orderSku: string,
    productSku: string,
    quantity: number,
    unitPrice: number,
    currency: string
  ) {
    super(orderSku) // inicializa aggregateId + occurredOn
    this.productSku = productSku
    this.quantity = quantity
    this.unitPrice = unitPrice
    this.currency = currency
  }
}