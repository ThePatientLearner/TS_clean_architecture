/**
 * domain/value-objects/sku.ts — Value Object "SKU" (Stock Keeping Unit).
 *
 * Un Value Object (VO) es un objeto definido únicamente por el valor de sus
 * atributos, NO por una identidad. Dos SKUs con el mismo string son iguales.
 * Los VOs son inmutables: una vez creado, no cambian. Si necesitas otro
 * SKU, creas otro nuevo.
 *
 * Aquí validamos las reglas de negocio del SKU (no vacío, mín. 3 chars)
 * en el constructor. Eso centraliza las invariantes: cualquier parte del
 * sistema que construya un SKU pasa por estas validaciones automáticamente.
 */
export class SKU {
  // `private readonly` → solo accesible desde dentro de la clase y no se
  // puede reasignar después del constructor (inmutabilidad real).
  private readonly _value: string

  /**
   * @param value - SKU en cualquier formato; se normaliza a mayúsculas y sin espacios.
   * @throws Error si está vacío o tiene menos de 3 caracteres.
   */
  constructor(value: string) {
    if (!value || value.trim().length === 0) {
      throw new Error('SKU cannot be empty')
    }
    if (value.trim().length < 3) {
      throw new Error('SKU must be at least 3 characters long')
    }
    // Normalizamos: trim y uppercase. A partir de aquí `_value` es la forma canónica.
    this._value = value.trim().toUpperCase()
  }

  /** Getter: expone el valor normalizado. No hay setter: es inmutable. */
  get value(): string {
    return this._value
  }

  /**
   * Comparación por valor (no por referencia). Como `_value` es un string
   * normalizado, dos SKUs con el mismo texto siempre serán iguales.
   */
  equals(other: SKU): boolean {
    return this._value === other._value
  }
}