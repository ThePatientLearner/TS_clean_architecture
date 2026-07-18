/**
 * composition/config.ts — Carga y validación tipada de variables de entorno.
 *
 * Usamos `zod` para definir un "schema" de las variables de entorno: nombre,
 * tipo, valores permitidos, defaults. Si el .env tiene algo mal, fallamos
 * al arrancar con un mensaje claro (en vez de un crash raro en runtime).
 *
 * Tres piezas clave:
 *   - `envSchema`  → schema de zod (validación + transformación).
 *   - `Config`     → tipo TS derivado del schema (z.infer). Garantiza que el
 *                    resto del código use `config.PORT` como número, no string.
 *   - `config`     → constante ya validada (lista para usar).
 *
 * Funciones helper (`useInMemoryDatabase`, `usePostgresDatabase`...) evitan
 * repetir `config.DATABASE_TYPE === 'memory'` por todos lados.
 */
import { z } from 'zod';
import 'dotenv/config';

// Schema de validación. Cada línea define una variable de entorno:
//   - NODE_ENV: solo estos tres valores posibles, default 'development'.
//   - PORT:     string del .env → parseInt → número 1-65535, default '3000'.
//   - DATABASE_TYPE: enum, default 'memory'.
//   - DATABASE_URL: opcional, pero validado como URL si existe.
//   - LOG_*: enum / boolean.
//   - OUTBOX_WORKER_INTERVAL_MS: string → número ≥100ms.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(1).max(65535)).default('3000'),

  // Database configuration
  DATABASE_TYPE: z.enum(['memory', 'postgres']).default('memory'),
  DATABASE_URL: z.string().url().optional(),

  // Logging configuration
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z.string().transform(val => val === 'true').pipe(z.boolean()).default('true'),

  // Optional configurations
  OUTBOX_WORKER_INTERVAL_MS: z.string().transform(val => parseInt(val, 10)).pipe(z.number().min(100)).default('1000'),
}).refine((data) => {
  // Validación cruzada: si eligen postgres, DATABASE_URL es obligatorio.
  if (data.DATABASE_TYPE === 'postgres' && !data.DATABASE_URL) {
    return false;
  }
  return true;
}, {
  // `message` se muestra si falla esta regla. `path` indica a qué campo "apuntar".
  message: "DATABASE_URL is required when DATABASE_TYPE is 'postgres'",
  path: ["DATABASE_URL"],
});

// `z.infer<typeof envSchema>` saca el tipo TS del schema: ya tenemos `Config`
// con `PORT: number`, `DATABASE_TYPE: 'memory' | 'postgres'`, etc.
export type Config = z.infer<typeof envSchema>;

/**
 * Valida `process.env` contra el schema. Si algo falla:
 *  - Loguea cada error con `path: message` para saber exactamente qué variable está mal.
 *  - `process.exit(1)`: mejor fallar al arrancar que con la app medio funcionando.
 * Si no hay errores, devuelve el objeto Config ya tipado.
 */
function validateConfig(): Config {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // `error.errors` es un array de { path, message, ... }. Lo aplanamos a texto.
      const errorMessages = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      });

      console.error('❌ Invalid environment configuration:');
      errorMessages.forEach(msg => console.error(`  - ${msg}`));

      process.exit(1);
    }

    // Si el error no es de zod, lo relanzamos (bug inesperado).
    throw error;
  }
}

// Constante global con la config ya validada. Importable desde cualquier sitio.
export const config = validateConfig();

/** Helper: devuelve la URL de BD (lanza si falta). */
export function getDatabaseUrl(cfg: Config = config): string {
  if (!cfg.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }
  return cfg.DATABASE_URL;
}

/** Helper: ¿estamos en desarrollo? */
export function isDevelopment(cfg: Config = config): boolean {
  return cfg.NODE_ENV === 'development';
}

/** Helper: ¿estamos en producción? */
export function isProduction(cfg: Config = config): boolean {
  return cfg.NODE_ENV === 'production';
}

/** Helper: ¿estamos corriendo tests? */
export function isTest(cfg: Config = config): boolean {
  return cfg.NODE_ENV === 'test';
}

/** Helper: ¿la BD configurada es en memoria? */
export function useInMemoryDatabase(cfg: Config = config): boolean {
  return cfg.DATABASE_TYPE === 'memory';
}

/** Helper: ¿la BD configurada es Postgres? */
export function usePostgresDatabase(cfg: Config = config): boolean {
  return cfg.DATABASE_TYPE === 'postgres';
}