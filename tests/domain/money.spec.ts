import { describe, it, expect } from 'vitest'
import { Money } from '@domain/value-objects/money'
import { Currency } from '@domain/value-objects/currency'

describe('Money', () => {
  describe('construction', () => {
    it('should create money with valid amount and currency', () => {
      const currency = new Currency('USD')
      const money = new Money(100.50, currency)

      expect(money.amount).toBe(100.50)
      expect(money.currency.code).toBe('USD')
    })

    it('should round amount to 2 decimal places', () => {
      const currency = new Currency('USD')
      const money = new Money(100.999, currency)

      expect(money.amount).toBe(101.00)
    })

    it('should throw error for negative amounts', () => {
      const currency = new Currency('USD')

      expect(() => new Money(-10, currency)).toThrow('Amount cannot be negative')
    })

    it('should throw error for infinite amounts', () => {
      const currency = new Currency('USD')

      expect(() => new Money(Infinity, currency)).toThrow('Amount must be a finite number')
    })

    it('should throw error for NaN amounts', () => {
      const currency = new Currency('USD')

      expect(() => new Money(NaN, currency)).toThrow('Amount must be a finite number')
    })
  })

  describe('operations', () => {
    it('should add money with same currency', () => {
      const usd = new Currency('USD')
      const money1 = new Money(100, usd)
      const money2 = new Money(50.25, usd)

      const result = money1.add(money2)

      expect(result.amount).toBe(150.25)
      expect(result.currency.code).toBe('USD')
    })

    it('should throw error when adding different currencies', () => {
      const usd = new Currency('USD')
      const eur = new Currency('EUR')
      const money1 = new Money(100, usd)
      const money2 = new Money(50, eur)

      expect(() => money1.add(money2)).toThrow('Cannot add money with different currencies')
    })

    it('should multiply by positive factor', () => {
      const currency = new Currency('USD')
      const money = new Money(25.50, currency)

      const result = money.multiply(3)

      expect(result.amount).toBe(76.50)
      expect(result.currency.code).toBe('USD')
    })

    it('should multiply by zero', () => {
      const currency = new Currency('USD')
      const money = new Money(100, currency)

      const result = money.multiply(0)

      expect(result.amount).toBe(0)
    })

    it('should throw error when multiplying by negative factor', () => {
      const currency = new Currency('USD')
      const money = new Money(100, currency)

      expect(() => money.multiply(-2)).toThrow('Factor cannot be negative')
    })
  })

  describe('equality', () => {
    it('should be equal when amount and currency match', () => {
      const usd = new Currency('USD')
      const money1 = new Money(100, usd)
      const money2 = new Money(100, usd)

      expect(money1.equals(money2)).toBe(true)
    })

    it('should not be equal when amounts differ', () => {
      const usd = new Currency('USD')
      const money1 = new Money(100, usd)
      const money2 = new Money(200, usd)

      expect(money1.equals(money2)).toBe(false)
    })

    it('should not be equal when currencies differ', () => {
      const usd = new Currency('USD')
      const eur = new Currency('EUR')
      const money1 = new Money(100, usd)
      const money2 = new Money(100, eur)

      expect(money1.equals(money2)).toBe(false)
    })
  })
})