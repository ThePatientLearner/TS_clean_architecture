/**
 * infrastructure/http/StaticPricingService.ts — Implementación "hardcoded" del PricingService.
 *
 * Para la demo, los precios están en un Map en memoria. En un sistema real
 * aquí consultarías una API de catálogo o una tabla de BD.
 *
 * Devuelve `Result<Money, AppError>` siguiendo el contrato del puerto:
 *   - Si el SKU existe → Ok(Money).
 *   - Si no existe     → Err(NotFoundError).
 *   - Si algo explota  → Err(InfraError) con la causa original.
 *
 * Como el constructor de Money valida importes/monedas, cualquier valor raro
 * en el Map lanzaría aquí y se convertiría en InfraError.
 */
import { SKU } from '../../domain/value-objects/sku.js'
import { Money } from '../../domain/value-objects/money.js'
import { Currency } from '../../domain/value-objects/currency.js'
import { Result, ok, fail } from '../../shared/result.js'
import { PricingService } from '../../application/ports/pricing-service.js'
import { AppError, NotFoundError, InfraError } from '../../application/errors.js'

export class StaticPricingService implements PricingService {
  // Catálogo de productos hardcodeado. La clave es el SKU (en mayúsculas).
  // Los importes y monedas ya están validados a priori (pero los VOs vuelven
  // a validarlos en el constructor de Money por seguridad).
  private readonly prices = new Map<string, { amount: number; currency: string }>([
    ['LAPTOP-001', { amount: 999.99, currency: 'USD' }],
    ['MOUSE-001', { amount: 29.99, currency: 'USD' }],
    ['KEYBOARD-001', { amount: 79.99, currency: 'USD' }],
    ['MONITOR-001', { amount: 299.99, currency: 'USD' }],
    ['HEADPHONES-001', { amount: 149.99, currency: 'USD' }],
    ['TABLET-001', { amount: 499.99, currency: 'EUR' }],
    ['PHONE-001', { amount: 799.99, currency: 'EUR' }],
    ['SPEAKER-001', { amount: 89.99, currency: 'GBP' }]
  ])

  /**
   * @param productSku SKU del producto (ya validado como VO).
   * @returns Ok(Money) si el SKU existe; Err(NotFoundError|InfraError) si no.
   */
  async getPrice(productSku: SKU): Promise<Result<Money, AppError>> {
    try {
      const priceData = this.prices.get(productSku.value)

      if (!priceData) {
        return fail(new NotFoundError('Product price', productSku.value))
      }

      // Construimos los VOs. Si algo es inválido, el `new` lanza → va al catch.
      const currency = new Currency(priceData.currency)
      const money = new Money(priceData.amount, currency)

      return ok(money)
    } catch (error) {
      // Cualquier excepción (Currency inválida, amount negativo...) se traduce
      // a InfraError para no exponer detalles internos al controller.
      return fail(new InfraError('Failed to get product price', error instanceof Error ? error : undefined))
    }
  }
}