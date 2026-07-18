/**
 * domain/value-objects/currency.ts — Value Object "Moneda".
 *
 * Mantiene una lista cerrada (whitelist) de monedas permitidas. Esto evita
 * tener strings sueltos "USD", "usd", "Dólar" circulando por el código:
 * si necesitas representar USD, instancias Currency y operas con el VO.
 *
 * Como Currency es un VO, dos Currency("USD") son iguales y se compara
 * con `.equals()` en lugar de `===`.
 */
export class Currency {
  // `static readonly` → constante de clase. Existe una sola copia compartida
  // por todas las instancias y no se puede reasignar.
  private static readonly VALID_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'MXN']

  private readonly _code: string

  /**
   * @param code - Código de moneda. Se normaliza a mayúsculas antes de validar.
   * @throws Error si el código no está en la whitelist.
   */
  constructor(code: string) {
    if (!code || !Currency.VALID_CURRENCIES.includes(code.toUpperCase())) {
      // Mensaje útil: dice exactamente qué monedas SÍ son válidas.
      throw new Error(`Invalid currency code: ${code}. Valid currencies: ${Currency.VALID_CURRENCIES.join(', ')}`)
    }
    this._code = code.toUpperCase()
  }

  get code(): string {
    return this._code
  }

  /** Comparación por valor. */
  equals(other: Currency): boolean {
    return this._code === other._code
  }
}