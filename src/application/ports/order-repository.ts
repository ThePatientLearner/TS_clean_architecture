/**
 * application/ports/order-repository.ts — Puerto "OrderRepository".
 *
 * Es el CONTRATO que cualquier adaptador de persistencia de pedidos debe cumplir.
 * La capa de aplicación solo conoce esta interfaz; no sabe si por debajo hay
 * Postgres, MySQL, MongoDB, un fichero, un Web Service o un simple Map en memoria.
 *
 * Decisiones:
 *  - Devuelve `Result<T, AppError>` en vez de lanzar excepciones: el caller
 *    decide cómo manejar el error (devolver 404, reintentar, etc.).
 *  - Trabaja con la entidad de dominio `Order` (no con filas de BD).
 *  - Recibe/expone VOs (SKU) en vez de strings primitivos, así las invariantes
 *    de validación ya se aplicaron al construir el VO.
 */
import { Order } from '../../domain/entities/order.js'
import { SKU } from '../../domain/value-objects/sku.js'
import { Result } from '../../shared/result.js'
import { AppError } from '../errors.js'

export interface OrderRepository {
  /**
   * Persiste el pedido (insert o update según corresponda).
   * @returns Ok(void) si se guardó; Err(AppError) si falló la infraestructura.
   */
  save(order: Order): Promise<Result<void, AppError>>

  /**
   * Busca un pedido por su SKU.
   * @returns Ok(Order) si existe; Err(NotFoundError) si no existe.
   */
  findById(sku: SKU): Promise<Result<Order, AppError>>
}