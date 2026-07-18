/**
 * infrastructure/persistence/in-memory/in-memory-order-repository.ts
 * Implementación in-memory del puerto `OrderRepository`.
 *
 * Es un `Map<SKU, Order>` envuelto en la interfaz. Sirve para:
 *   - Tests rápidos (sin BD).
 *   - Desarrollo local.
 *   - Demos.
 *
 * Punto interesante: `cloneOrder` crea una copia profunda-ish del pedido.
 * ¿Por qué? Para evitar que el código que recibe el Order (use cases) mute
 * accidentalmente la versión guardada. Cada `findById`/`save` devuelve/acepta
 * una copia, así el caller puede operar sin miedo a efectos colaterales.
 *
 * OJO: la "copia" no es perfecta: las propiedades de Order son `readonly`,
 * así que nadie externo puede mutarlas, pero sí puede llamar a métodos
 * como `addItem` (que modifica estado interno). El clearEvents al final
 * borra los eventos sintéticos del clone.
 */
import { Order } from '../../../domain/entities/order.js'
import { SKU } from '../../../domain/value-objects/sku.js'
import { Result, ok, fail } from '../../../shared/result.js'
import { OrderRepository } from '../../../application/ports/order-repository.js'
import { AppError, NotFoundError, InfraError } from '../../../application/errors.js'

export class InMemoryOrderRepository implements OrderRepository {
  // Clave = SKU normalizado (el VO ya hizo el trim+uppercase).
  private readonly orders = new Map<string, Order>()

  /**
   * "Guarda" el pedido. En memoria es trivial: clonar y meter en el Map.
   * Si dos pedidos tuvieran el mismo SKU, el segundo SOBREESCRIBE al primero
   * (semántica upsert, igual que en Postgres).
   */
  async save(order: Order): Promise<Result<void, AppError>> {
    try {
      const clonedOrder = this.cloneOrder(order)
      this.orders.set(order.sku.value, clonedOrder)
      return ok(undefined)
    } catch (error) {
      return fail(new InfraError('Failed to save order', error instanceof Error ? error : undefined))
    }
  }

  /**
   * Devuelve una COPIA del pedido o NotFoundError si no existe.
   * Devolver copia (en save y findById) hace que la BD lógica sea inmutable
   * desde fuera: el caller no puede romper el estado del repo.
   */
  async findById(sku: SKU): Promise<Result<Order, AppError>> {
    try {
      const order = this.orders.get(sku.value)
      if (!order) {
        return fail(new NotFoundError('Order', sku.value))
      }
      return ok(this.cloneOrder(order))
    } catch (error) {
      return fail(new InfraError('Failed to find order', error instanceof Error ? error : undefined))
    }
  }

  /**
   * "Clona" el pedido creando uno nuevo y re-aplicando los items.
   * Esto emite OrderCreated + N×ItemAddedToOrder de nuevo; los borramos
   * con `clearEvents()` al final para que el clone no traiga eventos "fantasma".
   */
  private cloneOrder(order: Order): Order {
    const cloned = new Order(order.sku)
    for (const item of order.items) {
      cloned.addItem(item.productSku, item.quantity, item.unitPrice)
    }
    cloned.clearEvents()
    return cloned
  }
}