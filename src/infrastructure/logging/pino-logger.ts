/**
 * infrastructure/logging/pino-logger.ts — Implementación del Logger con Pino.
 *
 * Pino es una librería de logging rápida para Node.js (mucho más rápida que
 * Winston en benchmarks). Su API principal es:
 *   pino().info(obj, msg)   → si pasas un objeto, se mezcla con el log.
 *   pino().info(msg)         → si solo pasas string, lo loguea tal cual.
 *   pino().child(context)    → crea un "child logger" con contexto heredado.
 *
 * Esta clase es un ADAPTADOR del puerto Logger:
 *   - Construye la instancia de Pino con la config del entorno.
 *   - Implementa info/error/warn/debug con la firma del puerto.
 *   - `child()` delega en `pino.child()` y devuelve un PinoLogger nuevo,
 *     para que añadir contexto sea seguro (no muta el original).
 */
import pino from 'pino'
import { Logger, LoggerContext } from '../../application/ports/logger.js'

export class PinoLogger implements Logger {
  // La instancia "real" de Pino. Encapsulamos su API detrás de nuestra interfaz Logger.
  private readonly pinoInstance: pino.Logger

  /**
   * @param pinoInstance (opcional) Instancia de Pino ya configurada. Si no se
   * pasa, se crea una por defecto leyendo variables de entorno.
   *
   * Truco del `??` (nullish coalescing): si pinoInstance es undefined/null,
   * usamos el valor de la derecha. Útil para tests: puedes inyectar un mock.
   */
  constructor(pinoInstance?: pino.Logger) {
    this.pinoInstance = pinoInstance ?? pino({
      name: 'clean-orders-app',
      level: process.env.LOG_LEVEL ?? 'info',
      // En desarrollo usamos pino-pretty (logs legibles con colores).
      // En producción, logs JSON estructurados (más fáciles de parsear por herramientas).
      transport: process.env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      } : undefined
    })
  }

  /**
   * IMPORTANTE: Pino tiene dos firmas:
   *   pino.info(obj, msg)  → "structured" (con datos)
   *   pino.info(msg)        → solo string
   * Aquí bifurcamos según si `obj` viene o no, para no romper la API.
   */
  info(message: string, obj?: object): void {
    if (obj) {
      this.pinoInstance.info(obj, message)
    } else {
      this.pinoInstance.info(message)
    }
  }

  error(message: string, obj?: object): void {
    if (obj) {
      this.pinoInstance.error(obj, message)
    } else {
      this.pinoInstance.error(message)
    }
  }

  warn(message: string, obj?: object): void {
    if (obj) {
      this.pinoInstance.warn(obj, message)
    } else {
      this.pinoInstance.warn(message)
    }
  }

  debug(message: string, obj?: object): void {
    if (obj) {
      this.pinoInstance.debug(obj, message)
    } else {
      this.pinoInstance.debug(message)
    }
  }

  /**
   * Devuelve un NUEVO PinoLogger que prepende `context` a cada log.
   * El logger original NO se muta: el child vive aparte.
   * Esto permite cosas como: `const reqLogger = logger.child({ requestId })`
   * y todos los logs de `reqLogger` llevan ese requestId automáticamente.
   */
  child(context: LoggerContext): Logger {
    const childPino = this.pinoInstance.child(context)
    return new PinoLogger(childPino)
  }
}