/**
 * application/ports/unit-of-work.ts — Puerto "Unit of Work" (UoW).
 *
 * El patrón Unit of Work agrupa varias operaciones de base de datos en una
 * única transacción atómica: o se ejecutan TODAS, o NINGUNA. Si una falla,
 * se hace ROLLBACK y los cambios parciales se deshacen.
 *
 * Aquí, `run(fn)` recibe una función que recibe los repositorios y hace
 * su trabajo. El UoW se encarga de:
 *   1. Abrir la transacción (BEGIN).
 *   2. Crear/instanciar los repositorios que compartirán esa transacción.
 *   3. Ejecutar la función del use case.
 *   4. Hacer COMMIT si todo fue bien, ROLLBACK si algo lanzó.
 *
 * ¿Por qué no usar el repositorio directamente? Porque si el use case hace
 * dos `save(...)` (p.ej. guardar pedido + guardar items) y entre medias se
 * cae la BD, quedarían datos a medias. Con UoW nos aseguramos de que ambos
 * se aplican o ninguno.
 */
import { Result } from '../../shared/result.js';
import { AppError } from '../errors.js';
import { OrderRepository } from './order-repository.js';

/** Repositorios que el callback del UoW tiene disponibles (comparten transacción). */
export interface Repositories {
  orderRepository: OrderRepository;
}

export interface UnitOfWork {
  /**
   * Ejecuta `fn` dentro de una transacción.
   * @param fn Función que recibe los repos transaccionales y devuelve un valor T.
   * @returns Ok(T) si la transacción hizo COMMIT; Err(InfraError) si hizo ROLLBACK.
   */
  run<T>(fn: (repos: Repositories) => Promise<T>): Promise<Result<T, AppError>>;
}