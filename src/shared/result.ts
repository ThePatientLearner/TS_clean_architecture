/**
 * shared/result.ts — Tipo `Result<T, E>` y helpers funcionales.
 *
 * En lugar de lanzar excepciones para errores de negocio, muchas funciones
 * devuelven un `Result` que es o un "éxito" con un dato (T) o un "fallo"
 * con un error (E). Es el patrón "Either" típico de lenguajes funcionales.
 *
 * ¿Por qué? Obliga al consumidor a comprobar el resultado antes de usarlo
 * (con `result.success` o con `isOk`/`isError`), evitando olvidos de try/catch
 * y haciendo explícito el camino de error en el tipo de retorno.
 *
 * Ejemplo de uso:
 *   const r = await createOrderUseCase.execute(dto)
 *   if (!r.success) return reply.code(400).send(r.error)
 *   // aquí TypeScript ya sabe que r.data es válido
 */

// Tipo discriminador por la propiedad `success`:
// - Si success=true  → el objeto trae `data` (valor de éxito)
// - Si success=false → el objeto trae `error` (valor de fallo)
// Así, según el caso del discriminated union, TS afina los tipos disponibles.
export type Result<T, E> =
  | { success: true; data: T; isSuccess: true; isFailure: false; value: T }
  | { success: false; error: E; isSuccess: false; isFailure: true }

/** Construye un Result de éxito envolviendo `value` en un objeto Ok. */
export const ok = <T>(value: T): Result<T, never> => ({
  success: true,
  data: value,
  isSuccess: true,
  isFailure: false,
  value
})

/** Construye un Result de fallo envolviendo `error` en un objeto Err. */
export const fail = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
  isSuccess: false,
  isFailure: true
})

/**
 * Type guard: si es Ok, TS "afina" el tipo y `result.data`/`result.value`
 * quedan disponibles sin necesidad de casting.
 */
export const isOk = <T, E>(result: Result<T, E>): result is { success: true; data: T; isSuccess: true; isFailure: false; value: T } =>
  result.success

/** Type guard simétrico al anterior pero para el caso de error. */
export const isError = <T, E>(result: Result<T, E>): result is { success: false; error: E; isSuccess: false; isFailure: true } =>
  !result.success

/**
 * `map` al estilo funcional: si es Ok aplica `fn` al valor; si es Err
 * propaga el error sin tocarlo. No se ejecuta `fn` en caso de fallo.
 */
export const map = <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> => {
  if (result.success) {
    return ok(fn(result.value))
  }
  return fail(result.error)
}

/**
 * `flatMap` (también llamado `bind` o `chain`): encadena operaciones que
 * también devuelven un Result, evitando el anidamiento Ok(Ok(...)).
 * Si el primer resultado es Err, el segundo nunca se ejecuta.
 */
export const flatMap = <T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> => {
  if (result.success) {
    return fn(result.value)
  }
  return fail(result.error)
}

/**
 * Combina varios Results: si todos son Ok, devuelve Ok con la lista de valores;
 * si alguno es Err, devuelve el primer Err encontrado (cortocircuito).
 * Útil para validar varias cosas a la vez y fallar rápido.
 */
export const combine = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = []

  for (const result of results) {
    if (result.isFailure) {
      return fail(result.error)
    }
    values.push(result.value)
  }

  return ok(values)
}