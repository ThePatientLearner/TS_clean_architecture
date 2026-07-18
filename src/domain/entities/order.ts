/**
 * domain/entities/order.ts — Aggregate Root "Pedido".
 *
 * En DDD, una Entity tiene identidad (su SKU) y un ciclo de vida. Aquí
 * "Order" es el agregado raíz: controla todos sus OrderItems y publica
 * los eventos de dominio cuando algo cambia.
 *
 * Responsabilidades:
 *  - Mantener la colección de items (Map indexado por SKU de producto).
 *  - Acumular eventos en `_events` para que la capa de aplicación los publique.
 *  - Calcular totales por moneda (un pedido puede mezclar monedas).
 *
 * Decisiones clave:
 *  - `_items` es Map<string, OrderItem>: añadir 2 veces el mismo producto
 *    incrementa cantidad (no crea duplicados).
 *  - `addItem` rechaza precios distintos para el mismo producto (consistencia).
 *  - `events` devuelve una copia (`[...this._events]`) para que nadie externo
 *    pueda mutar la lista interna.
 *  - `clearEvents` se llama tras publicar, para no reenviar el mismo evento.
 */
import { SKU } from '../value-objects/sku.js'
import { OrderItem } from '../value-objects/order-item.js'
import { Money } from '../value-objects/money.js'
import { Quantity } from '../value-objects/quantity.js'
import { DomainEvent } from '../events/domain-event.js'
import { OrderCreated } from '../events/order-created.js'
import { ItemAddedToOrder } from '../events/item-added-to-order.js'

export class Order {
  // El SKU identifica al pedido (es la "primary key" del agregado).
  private readonly _sku: SKU
  // Map<SKU-del-producto, OrderItem>: clave string del SKU para indexar rápido.
  private readonly _items: Map<string, OrderItem> = new Map()
  // Cola de eventos pendientes de publicar. El repositorio/event-bus los consume tras guardar.
  private readonly _events: DomainEvent[] = []

  /**
   * @param sku - SKU único del pedido. Crear el Order emite automáticamente OrderCreated.
   */
  constructor(sku: SKU) {
    this._sku = sku
    // Cada acción que cambia el estado va acompañada de un evento.
    this._events.push(new OrderCreated(sku.value))
  }

  get sku(): SKU {
    return this._sku
  }

  /** Devuelve una copia del array de items (no la referencia interna). */
  get items(): OrderItem[] {
    return Array.from(this._items.values())
  }

  /** Devuelve una copia de los eventos pendientes (defensa frente a mutaciones externas). */
  get events(): DomainEvent[] {
    return [...this._events]
  }

  /**
   * Añade un producto al pedido o incrementa su cantidad si ya existía.
   * Emite `ItemAddedToOrder` siempre que se ejecuta con éxito.
   *
   * @param productSku - SKU del producto a añadir.
   * @param quantity   - Cantidad a añadir (debe ser > 0, ya validado por el VO).
   * @param unitPrice  - Precio unitario (Money ya validado).
   * @throws Error si el producto ya estaba con un unitPrice distinto.
   */
  addItem(productSku: SKU, quantity: Quantity, unitPrice: Money): void {
    const existingItem = this._items.get(productSku.value)

    if (existingItem) {
      // Política: no se permite el mismo SKU con precios distintos.
      // Obliga a la capa de aplicación a gestionar cambios de precio explícitamente.
      if (!existingItem.unitPrice.equals(unitPrice)) {
        throw new Error('Cannot add item with different unit price')
      }
      // OrderItem es inmutable: increaseQuantity devuelve una NUEVA instancia.
      const updatedItem = existingItem.increaseQuantity(quantity)
      this._items.set(productSku.value, updatedItem)
    } else {
      // Primera vez que entra este producto: creamos el OrderItem.
      const newItem = new OrderItem(productSku, quantity, unitPrice)
      this._items.set(productSku.value, newItem)
    }

    // Tras cualquier cambio, dejamos constancia en la cola de eventos.
    this._events.push(new ItemAddedToOrder(
      this._sku.value,
      productSku.value,
      quantity.value,
      unitPrice.amount,
      unitPrice.currency.code
    ))
  }

  /**
   * Calcula el total del pedido agrupado por moneda.
   * Devuelve un Map<string, Money> donde la clave es el código de moneda
   * (p.ej. "USD") y el valor es el total acumulado en esa moneda.
   *
   * ¿Por qué agrupado? Un pedido podría tener líneas en distintas monedas,
   * y "sumar 5 USD + 3 EUR" no es un número único con sentido.
   */
  getTotalByCurrency(): Map<string, Money> {
    const totals = new Map<string, Money>()

    for (const item of this._items.values()) {
      const currencyCode = item.unitPrice.currency.code
      const itemTotal = item.totalPrice

      if (totals.has(currencyCode)) {
        // Ya existía un total para esta moneda: lo sumamos (Money.add valida misma moneda).
        const currentTotal = totals.get(currencyCode)!
        totals.set(currencyCode, currentTotal.add(itemTotal))
      } else {
        totals.set(currencyCode, itemTotal)
      }
    }

    return totals
  }

  /**
   * Vacía la cola de eventos. Se llama después de que el caso de uso haya
   * publicado los eventos en el bus, para no volver a publicarlos.
   * Truco: `_events.length = 0` vacía el array in-place conservando la referencia.
   */
  clearEvents(): void {
    this._events.length = 0
  }
}