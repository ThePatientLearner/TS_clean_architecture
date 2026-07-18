/**
 * application/errors.ts — Errores tipados de la capa de aplicación.
 *
 * Estos errores son los que devuelven los use cases como parte de un Result<T, AppError>.
 * Cada subclase lleva una propiedad `type` (string constante) que se usa para
 * mapear el error a un HTTP status en el controller (ver OrderController.mapErrorToStatusCode).
 *
 * La jerarquía:
 *   AppError (abstract)
 *     ├── ValidationError → 400  (datos de entrada malformados)
 *     ├── NotFoundError   → 404  (recurso no existe)
 *     ├── ConflictError   → 409  (duplicados, violación de invariantes de unicidad)
 *     └── InfraError      → 503  (fallo de infraestructura: BD, servicios externos, etc.)
 *
 * ¿Por qué una jerarquía? Permite que un use case devuelva `AppError` (la base)
 * y el caller haga `if (err.type === 'NOT_FOUND_ERROR')` sin saber el tipo exacto.
 */

// `abstract` → no puedes hacer `new AppError(...)`. Sirve solo como "tipo padre".
// `extends Error` → sigue siendo catchable con try/catch y tiene stack trace.
export abstract class AppError extends Error {
  // `abstract readonly` → cada subclase DEBE definir `type` con un literal concreto.
  abstract readonly type: string
}

/** 400 Bad Request — datos de entrada no pasan las validaciones de dominio. */
export class ValidationError extends AppError {
  readonly type = 'VALIDATION_ERROR'

  constructor(message: string) {
    // `super(message)` inicializa la `message` de la clase Error.
    super(message)
    // `name` aparece en logs y stack traces; lo fijamos para reconocerlo fácil.
    this.name = 'ValidationError'
  }
}

/** 404 Not Found — el recurso (pedido, producto…) no existe en el repositorio. */
export class NotFoundError extends AppError {
  readonly type = 'NOT_FOUND_ERROR'

  /**
   * @param resource  - Tipo de recurso (p.ej. "Order", "Product price").
   * @param identifier - (opcional) Identificador concreto que se buscó.
   */
  constructor(resource: string, identifier?: string) {
    // Mensaje legible: "Order with identifier 'SKU-123' not found".
    super(`${resource}${identifier ? ` with identifier '${identifier}'` : ''} not found`)
    this.name = 'NotFoundError'
  }
}

/** 409 Conflict — intento de crear algo que ya existe o viola una invariante única. */
export class ConflictError extends AppError {
  readonly type = 'CONFLICT_ERROR'

  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

/** 503 Service Unavailable — algo de infraestructura falló (BD caída, timeout, etc.). */
export class InfraError extends AppError {
  readonly type = 'INFRA_ERROR'

  /**
   * @param message - Mensaje legible del fallo.
   * @param cause   - Error original (opcional). Útil para `error.cause` en logs.
   */
  constructor(message: string, public readonly cause?: Error) {
    super(message)
    this.name = 'InfraError'
  }
}