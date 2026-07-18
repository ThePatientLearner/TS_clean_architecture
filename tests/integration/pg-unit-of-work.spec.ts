import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { PgUnitOfWork } from '../../src/infrastructure/persistence/postgres/pg-unit-of-work.js';
import { Order } from '../../src/domain/entities/order.js';
import { SKU } from '../../src/domain/value-objects/sku.js';
import { Money } from '../../src/domain/value-objects/money.js';
import { Currency } from '../../src/domain/value-objects/currency.js';
import { Quantity } from '../../src/domain/value-objects/quantity.js';
import { getDatabaseUrl } from '../../src/composition/config.js';

describe('PgUnitOfWork', () => {
  let pool: Pool;
  let unitOfWork: PgUnitOfWork;

  beforeAll(async () => {
    // Use test database
    pool = new Pool({
      connectionString: getDatabaseUrl(),
    });
    unitOfWork = new PgUnitOfWork(pool);

    // Clean up test data
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM order_items');
      await client.query('DELETE FROM orders');
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should successfully commit transaction when everything works', async () => {
    const orderSku = new SKU('TEST-ORDER-001');
    const productSku = new SKU('PRODUCT-001');
    
    const result = await unitOfWork.run(async (repos) => {
      // Create order
      const order = new Order(orderSku);
      order.addItem(
        productSku,
        new Quantity(2),
        new Money(10.50, new Currency('EUR'))
      );

      // Save order
      const saveResult = await repos.orderRepository.save(order);
      if (!saveResult.success) {
        throw saveResult.error;
      }

      return order;
    });

    expect(result.success).toBe(true);
    
    // Verify order was saved
    const findResult = await unitOfWork.run(async (repos) => {
      return await repos.orderRepository.findById(orderSku);
    });

    expect(findResult.success).toBe(true);
    if (findResult.success) {
      expect(findResult.data.success).toBe(true);
      if (findResult.data.success) {
        expect(findResult.data.data.sku.value).toBe('TEST-ORDER-001');
        expect(findResult.data.data.items).toHaveLength(1);
      }
    }
  });

  it('should rollback transaction when error occurs', async () => {
    const orderSku = new SKU('TEST-ORDER-002');
    
    const result = await unitOfWork.run(async (repos) => {
      // Create order
      const order = new Order(orderSku);

      // Save order
      const saveResult = await repos.orderRepository.save(order);
      if (!saveResult.success) {
        throw saveResult.error;
      }

      // Simulate error after save
      throw new Error('Simulated business logic error');
    });

    expect(result.success).toBe(false);
    
    // Verify order was not saved due to rollback
    const findResult = await unitOfWork.run(async (repos) => {
      return await repos.orderRepository.findById(orderSku);
    });

    expect(findResult.success).toBe(true);
    if (findResult.success) {
      const orderResult = findResult.data;
      expect(orderResult.success).toBe(false);
      if (!orderResult.success) {
        expect(orderResult.error.type).toBe('NOT_FOUND_ERROR');
      }
    }
  });

  it('should allow multiple repository operations in same transaction', async () => {
    const orderSku1 = new SKU('TEST-ORDER-003');
    const orderSku2 = new SKU('TEST-ORDER-004');
    
    const result = await unitOfWork.run(async (repos) => {
      // Create first order
      const order1 = new Order(orderSku1);
      const saveResult1 = await repos.orderRepository.save(order1);
      if (!saveResult1.success) {
        throw saveResult1.error;
      }

      // Create second order
      const order2 = new Order(orderSku2);
      const saveResult2 = await repos.orderRepository.save(order2);
      if (!saveResult2.success) {
        throw saveResult2.error;
      }

      return { order1, order2 };
    });

    expect(result.success).toBe(true);
    
    // Verify both orders were saved
    const findResult1 = await unitOfWork.run(async (repos) => {
      return await repos.orderRepository.findById(orderSku1);
    });
    
    const findResult2 = await unitOfWork.run(async (repos) => {
      return await repos.orderRepository.findById(orderSku2);
    });

    expect(findResult1.success).toBe(true);
    expect(findResult2.success).toBe(true);
  });
});
