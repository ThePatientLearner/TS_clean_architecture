/**
 * application/dto/add-item-to-order-dto.ts — DTO para añadir un item a un pedido.
 *
 * Combina lo que viene en el path param (orderSku) y en el body (productSku, quantity)
 * de la ruta `POST /orders/:orderSku/items` en una única estructura que el
 * caso de uso AddItemToOrder puede consumir de forma homogénea.
 */
export interface AddItemToOrderDto {
  /** SKU del pedido al que queremos añadir el item (viene de la URL). */
  orderSku: string
  /** SKU del producto a añadir (viene del body). */
  productSku: string
  /** Cantidad a añadir (viene del body). Será validada por el VO Quantity. */
  quantity: number
}