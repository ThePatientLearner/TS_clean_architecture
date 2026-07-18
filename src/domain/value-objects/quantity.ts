/**
 * domain/value-objects/quantity.ts — Value Object "Cantidad".
 *
 * Encapsula la regla "una cantidad debe ser un entero positivo".
 * Cualquier parte del sistema que necesite una cantidad pasa por aquí,
 * así no se cuelan valores raros (negativos, decimales como 2.5, NaN).
 */
export class Quantity {
  private readonly _value: number

  /**
   * @param value - Cantidad. Debe ser entero y > 0.
   * @throws Error si no se cumplen las reglas.
   */
  constructor(value: number) {
    // Doble check: debe ser entero Y mayor que 0. Number.isInteger rechaza NaN/Infinity también.
    if (value <= 0) {
      throw new Error('Quantity must be greater than zero')
    }
    if (!Number.isInteger(value)) {
      throw new Error('Quantity must be a whole number')
    }
    this._value = value
  }

  get value(): number {
    return this._value
  }

  /**
   * Suma inmutable: NO modifica `this`. Devuelve una nueva Quantity con el total.
   * Si la suma resultara inválida, el `new Quantity(...)` lanzaría el error.
   */
  add(other: Quantity): Quantity {
    return new Quantity(this._value + other._value)
  }

  /** Comparación por valor. */
  equals(other: Quantity): boolean {
    return this._value === other._value
  }
}