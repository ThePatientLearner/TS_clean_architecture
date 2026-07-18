import { describe, it, expect } from 'vitest'
import { Order } from '@domain/entities/order'
import { SKU } from '@domain/value-objects/sku'
import { Money } from '@domain/value-objects/money'
import { Currency } from '@domain/value-objects/currency'
import { Quantity } from '@domain/value-objects/quantity'
import { OrderCreated } from '@domain/events/order-created'
import { ItemAddedToOrder } from '@domain/events/item-added-to-order'

describe('Order', () => {
  describe('creation', () => {
    it('should create order with SKU', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)

      expect(order.sku.value).toBe('ORDER-001')
      expect(order.items).toHaveLength(0)
    })

    it('should emit OrderCreated event on creation', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)

      const events = order.events
      expect(events).toHaveLength(1)
      expect(events[0]).toBeInstanceOf(OrderCreated)
      expect(events[0].aggregateId).toBe('ORDER-001')
    })
  })

  describe('adding items', () => {
    it('should add item to order', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const productSku = new SKU('LAPTOP-001')
      const quantity = new Quantity(2)
      const unitPrice = new Money(999.99, new Currency('USD'))

      order.addItem(productSku, quantity, unitPrice)

      expect(order.items).toHaveLength(1)
      expect(order.items[0].productSku.value).toBe('LAPTOP-001')
      expect(order.items[0].quantity.value).toBe(2)
      expect(order.items[0].unitPrice.amount).toBe(999.99)
    })

    it('should emit ItemAddedToOrder event when adding item', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const productSku = new SKU('LAPTOP-001')
      const quantity = new Quantity(1)
      const unitPrice = new Money(999.99, new Currency('USD'))

      order.addItem(productSku, quantity, unitPrice)

      const events = order.events
      expect(events).toHaveLength(2) // OrderCreated + ItemAddedToOrder
      
      const itemAddedEvent = events[1] as ItemAddedToOrder
      expect(itemAddedEvent).toBeInstanceOf(ItemAddedToOrder)
      expect(itemAddedEvent.aggregateId).toBe('ORDER-001')
      expect(itemAddedEvent.productSku).toBe('LAPTOP-001')
      expect(itemAddedEvent.quantity).toBe(1)
      expect(itemAddedEvent.unitPrice).toBe(999.99)
      expect(itemAddedEvent.currency).toBe('USD')
    })

    it('should increase quantity when adding same product with same price', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const productSku = new SKU('LAPTOP-001')
      const unitPrice = new Money(999.99, new Currency('USD'))

      order.addItem(productSku, new Quantity(1), unitPrice)
      order.addItem(productSku, new Quantity(2), unitPrice)

      expect(order.items).toHaveLength(1)
      expect(order.items[0].quantity.value).toBe(3)
      expect(order.events).toHaveLength(3) // OrderCreated + 2 ItemAddedToOrder
    })

    it('should throw error when adding same product with different price', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const productSku = new SKU('LAPTOP-001')
      const price1 = new Money(999.99, new Currency('USD'))
      const price2 = new Money(1199.99, new Currency('USD'))

      order.addItem(productSku, new Quantity(1), price1)

      expect(() => {
        order.addItem(productSku, new Quantity(1), price2)
      }).toThrow('Cannot add item with different unit price')
    })

    it('should add multiple different products', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const laptop = new SKU('LAPTOP-001')
      const mouse = new SKU('MOUSE-001')
      const usd = new Currency('USD')

      order.addItem(laptop, new Quantity(1), new Money(999.99, usd))
      order.addItem(mouse, new Quantity(2), new Money(29.99, usd))

      expect(order.items).toHaveLength(2)
      expect(order.items[0].productSku.value).toBe('LAPTOP-001')
      expect(order.items[1].productSku.value).toBe('MOUSE-001')
    })
  })

  describe('totals calculation', () => {
    it('should calculate total by currency for single currency', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const usd = new Currency('USD')
      order.addItem(new SKU('LAPTOP-001'), new Quantity(1), new Money(999.99, usd))
      order.addItem(new SKU('MOUSE-001'), new Quantity(2), new Money(29.99, usd))

      const totals = order.getTotalByCurrency()

      expect(totals.size).toBe(1)
      expect(totals.get('USD')?.amount).toBe(1059.97) // 999.99 + (29.99 * 2)
    })

    it('should calculate totals by currency for multiple currencies', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      const usd = new Currency('USD')
      const eur = new Currency('EUR')

      order.addItem(new SKU('LAPTOP-001'), new Quantity(1), new Money(999.99, usd))
      order.addItem(new SKU('TABLET-001'), new Quantity(1), new Money(499.99, eur))

      const totals = order.getTotalByCurrency()

      expect(totals.size).toBe(2)
      expect(totals.get('USD')?.amount).toBe(999.99)
      expect(totals.get('EUR')?.amount).toBe(499.99)
    })

    it('should return empty map when no items', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)

      const totals = order.getTotalByCurrency()

      expect(totals.size).toBe(0)
    })
  })

  describe('event management', () => {
    it('should clear events', () => {
      const orderSku = new SKU('ORDER-001')
      const order = new Order(orderSku)
      
      order.addItem(
        new SKU('LAPTOP-001'),
        new Quantity(1),
        new Money(999.99, new Currency('USD'))
      )

      expect(order.events).toHaveLength(2)

      order.clearEvents()

      expect(order.events).toHaveLength(0)
    })
  })
})