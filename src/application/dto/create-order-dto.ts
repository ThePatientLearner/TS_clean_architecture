/**
 * application/dto/create-order-dto.ts — DTO para crear un pedido.
 *
 * Un DTO (Data Transfer Object) es un objeto "tonto" que solo lleva datos
 * y sirve para comunicar capas (HTTP ↔ application). No tiene lógica.
 *
 * Aquí es la "forma" mínima que el caso de uso CreateOrder necesita.
 * El controller HTTP construye este DTO a partir del body de la request
 * y se lo pasa al use case. Mantener los DTOs separados de las entidades
 * de dominio evita acoplar el modelo de transporte con el modelo de negocio.
 */
export interface CreateOrderDto {
  // SKU único que identificará al nuevo pedido.
  orderSku: string
}