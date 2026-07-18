/**
 * application/use-cases/add-item-to-order.ts — Caso de uso "Añadir item a pedido".
 *
 * Pasos:
 *   1. Validar entrada (VOs SKU y Quantity).
 *   2. Recuperar el pedido del repositorio.
 *   3. Pedir el precio actual al PricingService.
 *   4. Llamar a order.addItem(...) (reglas de negocio + emite ItemAddedToOrder).
 *   5. Guardar el pedido actualizado.
 *   6. Publicar los eventos generados.
 *
 * Fíjate en la diferencia con CreateOrder: aquí hacemos `findById` PRIMERO
 * para poder modificar el agregado. Sin un Order cargado no podemos llamar
 * a `addItem` (que es un método de instancia, no estático).
 */
import { SKU } from '../../domain/value-objects/sku.js'
import { Quantity } from '../../domain/value-objects/quantity.js'
import { Result, ok, fail } from '../../shared/result.js'
import { OrderRepository } from '../ports/order-repository.js'
import { PricingService } from '../ports/pricing-service.js'
import { EventBus } from '../ports/event-bus.js'
import { AddItemToOrderDto } from '../dto/add-item-to-order-dto.js'
import { AppError, ValidationError } from '../errors.js'

export class AddItemToOrder {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly pricingService: PricingService,
    private readonly eventBus: EventBus
  ) {}

  /**
   * @param dto Datos de entrada (orderSku, productSku, quantity).
   * @returns Ok(void) si añadió; Err(...) en caso contrario.
   */
  async execute(dto: AddItemToOrderDto): Promise<Result<void, AppError>> {
    try {
      // 1) VOs → aplican sus validaciones (SKU no vacío, Quantity > 0 entero).
      const orderSku = new SKU(dto.orderSku)
      const productSku = new SKU(dto.productSku)
      const quantity = new Quantity(dto.quantity)

      // 2) Recuperar el pedido existente. Si falla (no existe, BD caída...), salimos.
      const orderResult = await this.orderRepository.findById(orderSku)
      if (!orderResult.success) {
        return fail(orderResult.error)
      }
      const order = orderResult.data

      // 3) Pedir el precio al servicio de pricing.
      const priceResult = await this.pricingService.getPrice(productSku)
      if (!priceResult.success) {
        return fail(priceResult.error)
      }
      const unitPrice = priceResult.data

      // 4) Modificar la entidad. addItem puede lanzar (p.ej. SKU con precio distinto).
      //    El catch de abajo lo convierte en ValidationError.
      order.addItem(productSku, quantity, unitPrice)

      // 5) Persistir cambios.
      const saveResult = await this.orderRepository.save(order)
      if (!saveResult.success) {
        return fail(saveResult.error)
      }

      // 6) Publicar eventos (ItemAddedToOrder, y OrderCreated si era nuevo).
      const publishResult = await this.eventBus.publish(order.events)
      if (!publishResult.success) {
        return fail(publishResult.error)
      }

      return ok(undefined)
    } catch (error) {
      // Los throws vienen normalmente de los VOs o de addItem (reglas de negocio).
      if (error instanceof Error) {
        return fail(new ValidationError(error.message))
      }
      return fail(new ValidationError('Unknown validation error'))
    }
  }
}