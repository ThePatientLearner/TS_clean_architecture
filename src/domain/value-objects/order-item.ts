/**
 * domain/value-objects/order-item.ts — Línea de pedido.
 *
 * Combina tres VOs: SKU del producto + Quantity + Money (precio unitario).
 * Es inmutable: `increaseQuantity` devuelve una NUEVA instancia, no muta la actual.
 * El precio total se calcula on-demand (`totalPrice`) en lugar de guardarlo,
 * así no hay riesgo de que se desincronice con quantity/unitPrice.
 */
import { SKU } from './sku.js'
import { Quantity } from './quantity.js'
import { Money } from './money.js'

export class OrderItem {
  private readonly _productSku: SKU
  private readonly _quantity: Quantity
  private readonly _unitPrice: Money

  constructor(productSku: SKU, quantity: Quantity, unitPrice: Money) {
    this._productSku = productSku
    this._quantity = quantity
    this._unitPrice = unitPrice
  }

  get productSku(): SKU {
    return this._productSku
  }

  get quantity(): Quantity {
    return this._quantity
  }

  get unitPrice(): Money {
    return this._unitPrice
  }

  /**
   * Total = precio unitario × cantidad.
   * `Money.multiply` se encarga de redondear a 2 decimales.
   * No se cachea: cada llamada recalcula. Para líneas de pedido es barato y
   * garantiza que el total siempre está sincronizado con unitPrice/quantity.
   */
  get totalPrice(): Money {
    return this._unitPrice.multiply(this._quantity.value)
  }

  /**
   * Devuelve un nuevo OrderItem con la cantidad incrementada.
   * Inmutable: ni `this._quantity` ni el OrderItem original cambian.
   */
  increaseQuantity(additionalQuantity: Quantity): OrderItem {
    return new OrderItem(
      this._productSku,
      this._quantity.add(additionalQuantity),
      this._unitPrice
    )
  }

  /** Comparación por valor: mismo SKU, cantidad y precio. */
  equals(other: OrderItem): boolean {
    return this._productSku.equals(other._productSku) &&
           this._quantity.equals(other._quantity) &&
           this._unitPrice.equals(other._unitPrice)
  }
}