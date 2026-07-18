/**
 * infrastructure/persistence/postgres/pg-unit-of-work.ts
 * Implementación Postgres del puerto `UnitOfWork`.
 *
 * Receta:
 *   1. `pool.connect()` saca un cliente del pool (o crea uno si no hay libres).
 *   2. BEGIN abre la transacción en ESE cliente (no en otra conexión).
 *   3. Construye repositorios que reciben ESE cliente → comparten la transacción.
 *   4. Ejecuta la función del use case pasándole los repos.
 *   5. Si todo OK → COMMIT. Si lanzó → ROLLBACK. finally → release del cliente.
 *
 * Truco importante: usar el MISMO `client` para todas las queries del bloque
 * es lo que garantiza la atomicidad. Si cada repo sacara su propio cliente del
 * pool, no habría transacción real.
 */
import { Pool } from 'pg';
import { UnitOfWork, Repositories } from '../../../application/ports/unit-of-work.js';
import { PostgresOrderRepository } from './postgres-order-repository.js';
import { Result, ok, fail } from '../../../shared/result.js';
import { AppError, InfraError } from '../../../application/errors.js';

export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly pool: Pool) {}

  /**
   * Envuelve la función `fn` en una transacción.
   * @typeParam T - Tipo de retorno de `fn` (lo que sea: void, Order, etc.).
   */
  async run<T>(fn: (repos: Repositories) => Promise<T>): Promise<Result<T, AppError>> {
    // Sacamos un cliente del pool. Lo，我们会 usar ESTE cliente para todo.
    const client = await this.pool.connect();

    try {
      // BEGIN inicia la transacción. Hasta el COMMIT/ROLLBACK, todas las
      // queries sobre `client` forman parte de la misma transacción.
      await client.query('BEGIN');

      // Creamos repos que comparten ESTE cliente → comparten la transacción.
      const repositories: Repositories = {
        orderRepository: new PostgresOrderRepository(client),
      };

      // Ejecutamos la lógica del use case. Si lanza, vamos al catch → ROLLBACK.
      const result = await fn(repositories);

      // Si llegamos aquí, confirmamos.
      await client.query('COMMIT');

      return ok(result);
    } catch (error) {
      // Algo falló: deshacemos cualquier cambio parcial.
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : 'Unknown transaction error';
      return fail(new InfraError(`Transaction failed: ${errorMessage}`));
    } finally {
      // SIEMPRE devolvemos el cliente al pool (incluso si hubo COMMIT o ROLLBACK).
      // Si no, el pool se quedaría sin conexiones disponibles.
      client.release();
    }
  }
}