/**
 * infrastructure/persistence/postgres/postgres-order-repository.ts
 * Implementación Postgres del puerto `OrderRepository`.
 *
 * Es el ADAPTADOR de persistencia: traduce la entidad de dominio `Order`
 * a filas SQL (tablas `orders` + `order_items`) y viceversa.
 *
 * Decisiones:
 *  - Acepta `Client | PoolClient` en el constructor: así puede funcionar
 *    tanto con un cliente "común" (del Pool) como con un cliente transaccional
 *    (de PgUnitOfWork). La query es la misma en ambos casos.
 *  - Para mapear el SKU humano (string) a la PK de la tabla (UUID), se usa
 *    un hash determinista (generateUuidFromSku). Así el mismo SKU siempre
 *    cae en la misma fila, sin tener que mantener un mapping externo.
 *  - `save` hace UPSERT: si el pedido existe, lo actualiza; si no, lo crea.
 *    Después borra todos los items y los reinserta (estrategia "replace").
 *    Es sencillo, pero ineficiente para pedidos grandes; en producción
 *    podrías hacer diff y solo actualizar lo que cambió.
 */
import { Client, PoolClient } from 'pg';
import { createHash } from 'crypto';
import { OrderRepository } from '../../../application/ports/order-repository.js';
import { Order } from '../../../domain/entities/order.js';
import { SKU } from '../../../domain/value-objects/sku.js';
import { Money } from '../../../domain/value-objects/money.js';
import { Currency } from '../../../domain/value-objects/currency.js';
import { Quantity } from '../../../domain/value-objects/quantity.js';
import { Result, ok, fail } from '../../../shared/result.js';
import { AppError, InfraError, NotFoundError } from '../../../application/errors.js';

/** Forma de una fila de la tabla `orders`. */
interface OrderRow {
  id: string;
  customer_id: string;
  status: string;
  total_amount: number;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

/** Forma de una fila de la tabla `order_items`. */
interface OrderItemRow {
  id: string;
  order_id: string;
  sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  created_at: Date;
}

export class PostgresOrderRepository implements OrderRepository {
  // Aceptamos Client o PoolClient: la query API es idéntica.
  constructor(private readonly client: Client | PoolClient) {}

  /**
   * Persiste el pedido. Estrategia:
   *  1. Calcular el total por moneda (Order.getTotalByCurrency).
   *  2. UPSERT en `orders` (insert o update según exista).
   *  3. DELETE + INSERT en `order_items` (reemplazo completo).
   */
  async save(order: Order): Promise<Result<void, AppError>> {
    const connection = await this.getConnection();

    try {
      // Calculamos totales por moneda y, por simplicidad, tomamos la primera.
      // En un sistema multi-moneda real probablemente necesites una fila por moneda.
      const totals = order.getTotalByCurrency();
      const totalEntries = Array.from(totals.entries());

      const totalMoney = totalEntries.length > 0
        ? totalEntries[0][1]
        : new Money(0, new Currency('EUR')); // fallback si no hay items

      await this.upsertOrder(connection, order, totalMoney);
      await this.replaceOrderItems(connection, order);

      return ok(undefined);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      return fail(new InfraError(`Failed to save order: ${errorMessage}`));
    }
  }

  /**
   * Recupera un pedido por su SKU y reconstruye la entidad `Order`
   * re-aplicando los items (que también emiten ItemAddedToOrder).
   * Tras reconstruir, limpia los eventos (no queremos re-publicarlos).
   */
  async findById(sku: SKU): Promise<Result<Order, AppError>> {
    try {
      // Mapeamos SKU → UUID determinista para buscar en BD.
      const customerUuid = this.generateUuidFromSku(sku.value)
      const orderQuery = `
        SELECT id, customer_id, status, total_amount, currency, created_at, updated_at
        FROM orders
        WHERE customer_id = $1
      `;

      const orderResult = await this.client.query<OrderRow>(orderQuery, [customerUuid]);

      if (orderResult.rows.length === 0) {
        return fail(new NotFoundError('Order', sku.value));
      }

      const orderRow = orderResult.rows[0];

      // Recuperamos los items del pedido, ordenados por creación.
      const itemsQuery = `
        SELECT id, order_id, sku, quantity, unit_price, total_price, created_at
        FROM order_items
        WHERE order_id = $1
        ORDER BY created_at ASC
      `;

      const itemsResult = await this.client.query<OrderItemRow>(itemsQuery, [orderRow.id]);

      // Reconstruimos la entidad. OJO: `new Order(sku)` emite OrderCreated,
      // pero como luego hacemos addItem(...) y al final clearEvents(),
      // ese evento queda borrado. La idea es: este pedido ya EXISTE en BD,
      // no queremos re-emitir OrderCreated como si fuera nuevo.
      const order = new Order(sku);

      for (const itemRow of itemsResult.rows) {
        const productSku = new SKU(itemRow.sku);
        const quantity = new Quantity(itemRow.quantity);
        const currency = new Currency(orderRow.currency);
        const unitPrice = new Money(itemRow.unit_price, currency);

        order.addItem(productSku, quantity, unitPrice);
      }

      // Limpiamos los eventos sintéticos de la reconstrucción.
      order.clearEvents();

      return ok(order);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      return fail(new InfraError(`Failed to find order: ${errorMessage}`));
    }
  }

  /** Devuelve el cliente inyectado (siempre el mismo). */
  private async getConnection(): Promise<PoolClient | Client> {
    return this.client;
  }

  /**
   * UPSERT: inserta si no existe (por customer_id, que es único), o actualiza
   * los campos editables si ya existe. `gen_random_uuid()` requiere la extensión pgcrypto.
   */
  private async upsertOrder(
    connection: PoolClient | Client,
    order: Order,
    totalMoney: Money
  ): Promise<void> {
    const customerUuid = this.generateUuidFromSku(order.sku.value)

    const upsertQuery = `
      INSERT INTO orders (id, customer_id, status, total_amount, currency, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (customer_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        total_amount = EXCLUDED.total_amount,
        currency = EXCLUDED.currency,
        updated_at = NOW()
    `;

    await connection.query(upsertQuery, [
      customerUuid,
      'pending', // Default status
      totalMoney.amount,
      totalMoney.currency.code
    ]);
  }

  /**
   * Reemplaza TODOS los items de un pedido. Pasos:
   *  1. Obtener el `id` interno del pedido (no el customer_id).
   *  2. DELETE de los items existentes.
   *  3. INSERT de los items actuales (uno por uno, sin batch).
   */
  private async replaceOrderItems(
    connection: PoolClient | Client,
    order: Order
  ): Promise<void> {
    const customerUuid = this.generateUuidFromSku(order.sku.value)
    const orderIdQuery = `
      SELECT id FROM orders WHERE customer_id = $1
    `;
    const orderIdResult = await connection.query(orderIdQuery, [customerUuid]);

    if (orderIdResult.rows.length === 0) {
      // Si llegamos aquí es porque algo fue mal entre upsertOrder y aquí.
      throw new Error('Order not found after upsert');
    }

    const orderId = orderIdResult.rows[0].id;

    // Borrado en cascada también funcionaría por FK ON DELETE CASCADE, pero
    // queremos ser explícitos.
    const deleteQuery = `
      DELETE FROM order_items WHERE order_id = $1
    `;
    await connection.query(deleteQuery, [orderId]);

    // Reinsertar solo si hay items (un pedido recién creado puede no tener).
    if (order.items.length > 0) {
      const insertQuery = `
        INSERT INTO order_items (id, order_id, sku, quantity, unit_price, total_price, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
      `;

      for (const item of order.items) {
        await connection.query(insertQuery, [
          orderId,
          item.productSku.value,
          item.quantity.value,
          item.unitPrice.amount,
          item.totalPrice.amount
        ]);
      }
    }
  }

  /**
   * Convierte un SKU (string legible) en un UUID v4 determinista.
   * Lo necesitamos porque la tabla `orders` usa UUID como PK, pero nosotros
   * trabajamos con SKUs humanos. Con un hash SHA-256 del SKU, el mismo SKU
   * siempre produce el mismo UUID.
   *
   * NOTA: no es un UUID v4 "real" criptográficamente válido (versión/variant
   * fijados a mano), pero es válido sintácticamente para Postgres y estable.
   */
  private generateUuidFromSku(sku: string): string {
    const hash = createHash('sha256').update(sku).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16), // Version 4 (arbitrario)
      '8' + hash.substring(17, 20), // Variant bits
      hash.substring(20, 32)
    ].join('-');
  }
}