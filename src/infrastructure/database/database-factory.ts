/**
 * infrastructure/database/database-factory.ts — Factory Singleton del Pool de Postgres.
 *
 * `pg.Pool` mantiene un conjunto de conexiones reutilizables a la BD. Crear
 * pools por aquí y por allá sería un desperdicio (y un riesgo de fuga de
 * conexiones). Por eso este factory sigue el patrón Singleton: solo se crea
 * UN pool por proceso y se comparte entre los repositorios.
 *
 * Métodos:
 *   - createPool()          → devuelve el pool (lo crea si no existe).
 *   - createUnitOfWork()    → convenience: devuelve un PgUnitOfWork sobre el pool.
 *   - closePool()           → cierra todas las conexiones (graceful shutdown).
 */
import { Pool } from 'pg';
import { PgUnitOfWork } from '../persistence/postgres/pg-unit-of-work.js';
import { getDatabaseUrl } from '../../composition/config.js';

export class DatabaseFactory {
  // `static private` → campo de clase (compartido por todas las instancias).
  // Aquí `DatabaseFactory` se usa sin instanciar (como namespace estático).
  private static pool: Pool | null = null;

  /**
   * Devuelve el pool de conexiones, creándolo la primera vez.
   *
   * Opciones del pool:
   *  - max: 10 conexiones simultáneas como máximo.
   *  - idleTimeoutMillis: 30s → cierra conexiones que llevan 30s sin usarse.
   *  - connectionTimeoutMillis: 5s → si no se puede conectar, falla rápido.
   */
  static createPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: getDatabaseUrl(),
        max: 10, // Maximum number of connections in pool
        idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
        connectionTimeoutMillis: 5000, // Return error after 5 seconds if connection could not be established
      });

      // Handler de errores: si una conexión "muerta" emite un error en idle,
      // sin listener el proceso haría crash silencioso. Lo logamos y salimos.
      this.pool.on('error', (err: Error) => {
        console.error('Unexpected error on idle client', err);
        process.exit(-1);
      });
    }

    return this.pool;
  }

  /**
   * Crea un UnitOfWork transaccional que internamente usa el mismo pool.
   * Lo expone como `static` para que el container pueda obtenerlo fácilmente.
   */
  static createUnitOfWork(): PgUnitOfWork {
    const pool = this.createPool();
    return new PgUnitOfWork(pool);
  }

  /**
   * Cierra el pool. Después de llamar a esto, NO se puede usar `createPool()`
   * otra vez en el mismo proceso (habría que instanciar un Pool nuevo).
   */
  static async closePool(): Promise<void> {
    if (this.pool) {
      await this.pool.end(); // espera a que las queries en vuelo terminen
      this.pool = null;
    }
  }
}