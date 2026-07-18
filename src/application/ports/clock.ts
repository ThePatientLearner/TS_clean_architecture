/**
 * application/ports/clock.ts — Puerto "Clock" (reloj abstracto).
 *
 * En vez de hacer `new Date()` directamente dentro de los casos de uso o
 * entidades, pedimos un Clock. En producción se inyecta un Clock que usa
 * el reloj real; en los tests se inyecta un Clock fake con fechas fijas.
 *
 * Esto es Inversión de Dependencias: la aplicación depende de una
 * abstracción (esta interfaz), no de una clase concreta.
 *
 * NOTA: en este repo Clock está definido pero todavía no inyectado en los
 * use cases; está disponible para refactors futuros.
 */
export interface Clock {
  /** Devuelve la fecha/hora actual. */
  now(): Date
}