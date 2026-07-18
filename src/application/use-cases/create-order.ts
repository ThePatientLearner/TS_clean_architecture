/**
 * application/use-cases/create-order.ts — Caso de uso "Crear pedido".
 *
 * Orquesta los pasos para crear un pedido:
 *   1. Validar entrada (creando VOs que aplicarán sus reglas).
 *   2. Comprobar que NO existe ya un pedido con ese SKU.
 *   3. Instanciar la entidad Order (esto emite OrderCreated automáticamente).
 *   4. Guardar en el repositorio.
 *   5. Publicar los eventos generados en el bus.
 *
 * Es un patrón típico "Use Case" / "Command":
 *   - Recibe un DTO (datos de entrada).
 *   - Devuelve un `Result<void, AppError>` (éxito o fallo tipado).
 *   - NO depende de Fastify/Express ni de ninguna tecnología concreta.
 *
 * Inyección por constructor: `private readonly` + TS los marca como privados
 * automáticamente (los declaras en `constructor(...)` sin `this.x = x`).
 */
import { Order } from '../../domain/entities/order.js'
import { SKU } from '../../domain/value-objects/sku.js'
import { Result, ok, fail } from '../../shared/result.js'
import { OrderRepository } from '../ports/order-repository.js'
import { EventBus } from '../ports/event-bus.js'
import { CreateOrderDto } from '../dto/create-order-dto.js'
import { AppError, ValidationError, ConflictError } from '../errors.js'

export class CreateOrder {
  // Shorthand de TS: `private readonly orderRepository` declara el campo Y lo asigna.
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly eventBus: EventBus
  ) {}

  /**
   * Punto de entrada del caso de uso.
   *
   * @param dto Datos de entrada (orderSku).
   * @returns Ok(void) si se creó; Err(ValidationError|ConflictError|InfraError) si falló.
   */
  async execute(dto: CreateOrderDto): Promise<Result<void, AppError>> {
    try {
      // 1) Construir VOs: ya validan (SKU no vacío, mín. 3 chars). Si falla, lanza.
      const orderSku = new SKU(dto.orderSku)

      // 2) Comprobar unicidad: si ya existe, devolvemos ConflictError (HTTP 409).
      //    Distinguimos "no existe" (NotFoundError, OK para seguir) de "otro error
      //    de infraestructura" (p.ej. BD caída), que sí propagamos.
      const existingOrderResult = await this.orderRepository.findById(orderSku)
      if (existingOrderResult.success) {
        return fail(new ConflictError(`Order with SKU '${dto.orderSku}' already exists`))
      }

      // Si el fallo NO fue "not found", es un error real (BD caída, timeout...).
      // Lo propagamos tal cual sin traducirlo.
      if (existingOrderResult.error.type !== 'NOT_FOUND_ERROR') {
        return fail(existingOrderResult.error)
      }

      // 3) Crear la entidad. Esto emite OrderCreated y lo deja en order._events.
      const order = new Order(orderSku)

      // 4) Persistir. Si falla, propagamos el error.
      const saveResult = await this.orderRepository.save(order)
      if (!saveResult.success) {
        return fail(saveResult.error)
      }

      // 5) Publicar eventos generados. Si falla, devolvemos el error (en setups
      //    reales probablemente quieras compensarlo o encolarlo para reintento).
      const publishResult = await this.eventBus.publish(order.events)
      if (!publishResult.success) {
        return fail(publishResult.error)
      }

      // Éxito: Result<void, AppError>. Envolvemos `undefined` en `ok(...)`.
      return ok(undefined)
    } catch (error) {
      // Cualquier `throw` aquí viene normalmente de un VO (Validación).
      // Lo traducimos a ValidationError para que el controller lo mapee a HTTP 400.
      if (error instanceof Error) {
        return fail(new ValidationError(error.message))
      }
      return fail(new ValidationError('Unknown validation error'))
    }
  }
}