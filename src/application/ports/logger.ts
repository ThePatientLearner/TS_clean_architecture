/**
 * application/ports/logger.ts — Puerto "Logger".
 *
 * Define el contrato mínimo de logging que la aplicación necesita.
 * La infraestructura (PinoLogger, en este proyecto) implementa esta interfaz.
 *
 * ¿Por qué no usar `console.log` directamente? Para poder:
 *   - Inyectar un logger fake en tests que capture los mensajes.
 *   - Cambiar de implementación (Pino, Winston, Datadog...) sin tocar la app.
 *   - Crear "child loggers" con contexto heredado (requestId, operation...).
 *
 * El método `child(context)` devuelve un Logger nuevo que lleva ese contexto
 * en cada llamada. Así, en un mismo request, todos los logs llevan el mismo
 * requestId sin tener que pasarlo manualmente a cada función.
 */

// `LoggerContext` es un objeto libre: admite cualquier par clave/valor.
// El `[key: string]: any` (index signature) permite añadir campos extra sin
// tener que tocar esta interfaz. Útil para `requestId`, `userId`, `orderSku`...
export interface LoggerContext {
  requestId?: string
  userId?: string
  operation?: string
  [key: string]: any
}

export interface Logger {
  /** Mensaje informativo. `obj` opcional: datos estructurados extra (JSON). */
  info(message: string, obj?: object): void
  error(message: string, obj?: object): void
  warn(message: string, obj?: object): void
  debug(message: string, obj?: object): void
  /**
   * Devuelve un nuevo logger que prepende `context` a todos sus mensajes.
   * El logger original NO se modifica (inmutable a nivel lógico).
   */
  child(context: LoggerContext): Logger
}