import { describe, it, expect, beforeEach } from 'vitest'
import { AddItemToOrder } from '@application/use-cases/add-item-to-order'
import { InMemoryOrderRepository } from '@infrastructure/persistence/in-memory/in-memory-order-repository'
import { StaticPricingService } from '@infrastructure/http/StaticPricingService'
import { NoopEventBus } from '@infrastructure/messaging/NoopEventBus'
import { Order } from '@domain/entities/order'
import { SKU } from '@domain/value-objects/sku'
import { isOk, isError } from '@shared/result'

describe('AddItemToOrder - Acceptance Test', () => {
  let orderRepository: InMemoryOrderRepository
  let pricingService: StaticPricingService
  let eventBus: NoopEventBus
  let addItemToOrderUseCase: AddItemToOrder

  beforeEach(() => {
    orderRepository = new InMemoryOrderRepository()
    pricingService = new StaticPricingService()
    eventBus = new NoopEventBus()
    addItemToOrderUseCase = new AddItemToOrder(orderRepository, pricingService, eventBus)
  })

  describe('successful scenarios', () => {
    it('should add item to existing order', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Adding an item to the order
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'LAPTOP-001',
        quantity: 2
      })

      // Then: The operation succeeds
      expect(isOk(result)).toBe(true)

      // And: The order contains the new item
      const orderResult = await orderRepository.findById(orderSku)
      expect(isOk(orderResult)).toBe(true)
      
      if (isOk(orderResult)) {
        const updatedOrder = orderResult.data
        expect(updatedOrder.items).toHaveLength(1)
        expect(updatedOrder.items[0].productSku.value).toBe('LAPTOP-001')
        expect(updatedOrder.items[0].quantity.value).toBe(2)
        expect(updatedOrder.items[0].unitPrice.amount).toBe(999.99)
        expect(updatedOrder.items[0].unitPrice.currency.code).toBe('USD')
      }
    })

    it('should add multiple items to order', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Adding multiple items
      await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'LAPTOP-001',
        quantity: 1
      })

      await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'MOUSE-001',
        quantity: 3
      })

      // Then: The order contains both items
      const orderResult = await orderRepository.findById(orderSku)
      expect(isOk(orderResult)).toBe(true)
      
      if (isOk(orderResult)) {
        const updatedOrder = orderResult.data
        expect(updatedOrder.items).toHaveLength(2)

        const laptopItem = updatedOrder.items.find(item => item.productSku.value === 'LAPTOP-001')
        expect(laptopItem?.quantity.value).toBe(1)
        expect(laptopItem?.unitPrice.amount).toBe(999.99)

        const mouseItem = updatedOrder.items.find(item => item.productSku.value === 'MOUSE-001')
        expect(mouseItem?.quantity.value).toBe(3)
        expect(mouseItem?.unitPrice.amount).toBe(29.99)
      }
    })

    it('should increase quantity when adding same product', async () => {
      // Given: An existing order with an item
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'KEYBOARD-001',
        quantity: 1
      })

      // When: Adding the same product again
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'KEYBOARD-001',
        quantity: 2
      })

      // Then: The operation succeeds
      expect(isOk(result)).toBe(true)

      // And: The quantity is increased
      const orderResult = await orderRepository.findById(orderSku)
      if (isOk(orderResult)) {
        const updatedOrder = orderResult.data
        expect(updatedOrder.items).toHaveLength(1)
        expect(updatedOrder.items[0].productSku.value).toBe('KEYBOARD-001')
        expect(updatedOrder.items[0].quantity.value).toBe(3) // 1 + 2
      }
    })

    it('should handle different currencies', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Adding items with different currencies
      await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'LAPTOP-001', // USD
        quantity: 1
      })

      await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'TABLET-001', // EUR
        quantity: 1
      })

      // Then: Both items are added with correct currencies
      const orderResult = await orderRepository.findById(orderSku)
      if (isOk(orderResult)) {
        const updatedOrder = orderResult.data
        expect(updatedOrder.items).toHaveLength(2)

        const totals = updatedOrder.getTotalByCurrency()
        expect(totals.size).toBe(2)
        expect(totals.get('USD')?.amount).toBe(999.99)
        expect(totals.get('EUR')?.amount).toBe(499.99)
      }
    })
  })

  describe('error scenarios', () => {
    it('should fail when order does not exist', async () => {
      // When: Adding item to non-existent order
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'NON-EXISTENT',
        productSku: 'LAPTOP-001',
        quantity: 1
      })

      // Then: The operation fails with NotFoundError
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.error.type).toBe('NOT_FOUND_ERROR')
        expect(result.error.message).toContain('NON-EXISTENT')
      }
    })

    it('should fail when product does not exist in pricing service', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Adding non-existent product
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'NON-EXISTENT-PRODUCT',
        quantity: 1
      })

      // Then: The operation fails with NotFoundError
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.error.type).toBe('NOT_FOUND_ERROR')
        expect(result.error.message).toContain('NON-EXISTENT-PRODUCT')
      }
    })

    it('should fail with invalid order SKU', async () => {
      // When: Using invalid order SKU
      const result = await addItemToOrderUseCase.execute({
        orderSku: '', // Invalid SKU
        productSku: 'LAPTOP-001',
        quantity: 1
      })

      // Then: The operation fails with ValidationError
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
        expect(result.error.message).toContain('SKU cannot be empty')
      }
    })

    it('should fail with invalid product SKU', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Using invalid product SKU
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'AB', // Too short
        quantity: 1
      })

      // Then: The operation fails with ValidationError
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
        expect(result.error.message).toContain('must be at least 3 characters')
      }
    })

    it('should fail with invalid quantity', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Using invalid quantity
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'LAPTOP-001',
        quantity: 0 // Invalid quantity
      })

      // Then: The operation fails with ValidationError
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
        expect(result.error.message).toContain('must be greater than zero')
      }
    })

    it('should fail with negative quantity', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Using negative quantity
      const result = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-001',
        productSku: 'LAPTOP-001',
        quantity: -5 // Invalid negative quantity
      })

      // Then: The operation fails with ValidationError
      expect(isError(result)).toBe(true)
      if (isError(result)) {
        expect(result.error.type).toBe('VALIDATION_ERROR')
        expect(result.error.message).toContain('must be greater than zero')
      }
    })
  })

  describe('integration with all adapters', () => {
    it('should successfully integrate order repository, pricing service, and event bus', async () => {
      // Given: An existing order
      const orderSku = new SKU('ORDER-INTEGRATION-001')
      const existingOrder = new Order(orderSku)
      await orderRepository.save(existingOrder)

      // When: Adding multiple items with different currencies
      const laptopResult = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-INTEGRATION-001',
        productSku: 'LAPTOP-001',
        quantity: 1
      })

      const speakerResult = await addItemToOrderUseCase.execute({
        orderSku: 'ORDER-INTEGRATION-001',
        productSku: 'SPEAKER-001', // GBP currency
        quantity: 2
      })

      // Then: Both operations succeed
      expect(isOk(laptopResult)).toBe(true)
      expect(isOk(speakerResult)).toBe(true)

      // And: The order is properly updated
      const finalOrderResult = await orderRepository.findById(orderSku)
      if (isOk(finalOrderResult)) {
        const finalOrder = finalOrderResult.data
        expect(finalOrder.items).toHaveLength(2)

        const totals = finalOrder.getTotalByCurrency()
        expect(totals.size).toBe(2)
        expect(totals.get('USD')?.amount).toBe(999.99)
        expect(totals.get('GBP')?.amount).toBe(179.98) // 89.99 * 2
      }
    })
  })
})