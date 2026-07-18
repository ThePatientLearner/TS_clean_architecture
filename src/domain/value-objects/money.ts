/**
 * domain/value-objects/money.ts — Value Object "Dinero" (cantidad + moneda).
 *
 * Reglas de negocio:
 *  - El importe no puede ser negativo.
 *  - El importe debe ser un número finito (rechaza NaN/Infinity).
 *  - Se redondea a 2 decimales para evitar errores de coma flotante.
 *  - No se puede sumar dinero de monedas distintas (rompería el total).
 *
 * Al igual que el resto de VOs: inmutable, identidad por valor, validaciones
 * en el constructor.
 */
import { Currency } from './currency.js'

export class Money {
  private readonly _amount: number
  private readonly _currency: Currency

  /**
   * @param amount - Importe numérico. Se redondea a 2 decimales.
   * @param currency - Instancia de Currency (ya validada).
   */
  constructor(amount: number, currency: Currency) {
    if (amount < 0) {
      throw new Error('Amount cannot be negative')
    }
    if (!Number.isFinite(amount)) {
      // Rechaza NaN, Infinity, -Infinity. Sin esto, podrías operar con NaN sin darte cuenta.
      throw new Error('Amount must be a finite number')
    }
    // Redondeo a 2 decimales: típico para importes monetarios (céntimos).
    // Sin esto, 0.1 + 0.2 = 0.30000000000000004 en IEEE-754.
    this._amount = Math.round(amount * 100) / 100
    this._currency = currency
  }

  get amount(): number {
    return this._amount
  }

  get currency(): Currency {
    return this._currency
  }

  /**
   * Suma dos Money. Regla: solo se suman si comparten la misma moneda.
   * Si no, lanza error: no tiene sentido "sumar 5 USD + 3 EUR" sin un tipo de cambio.
   */
  add(other: Money): Money {
    if (!this._currency.equals(other._currency)) {
      throw new Error('Cannot add money with different currencies')
    }
    return new Money(this._amount + other._amount, this._currency)
  }

  /**
   * Multiplica el importe por un factor (p.ej. cantidad de unidades).
   * El factor no puede ser negativo.
   */
  multiply(factor: number): Money {
    if (factor < 0) {
      throw new Error('Factor cannot be negative')
    }
    return new Money(this._amount * factor, this._currency)
  }

  /** Comparación por valor: mismo importe y misma moneda. */
  equals(other: Money): boolean {
    return this._amount === other._amount && this._currency.equals(other._currency)
  }
}