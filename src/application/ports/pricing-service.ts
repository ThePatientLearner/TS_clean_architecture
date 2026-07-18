/**
 * application/ports/pricing-service.ts — Puerto "PricingService".
 *
 * Servicio externo de precios. El caso de uso AddItemToOrder lo consulta para
 * saber cuánto cuesta un producto antes de añadirlo al pedido.
 *
 * Definirlo como puerto permite sustituir la fuente real (API REST, base de
 * datos de catálogo, archivo CSV, etc.) sin tocar la lógica de negocio.
 * Aquí usamos StaticPricingService (precios hardcoded para demos).
 */
import { SKU } from '../../domain/value-objects/sku.js'
import { Money } from '../../domain/value-objects/money.js'
import { Result } from '../../shared/result.js'
import { AppError } from '../errors.js'

export interface PricingService {
  /**
   * Devuelve el precio actual de un producto.
   * @returns Ok(Money) si se conoce el precio; Err(NotFoundError) si no existe.
   */
  getPrice(productSku: SKU): Promise<Result<Money, AppError>>
}