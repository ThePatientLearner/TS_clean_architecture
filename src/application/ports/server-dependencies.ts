/**
 * application/ports/server-dependencies.ts — Dependencias mínimas del servidor HTTP.
 *
 * Esta interfaz define QUÉ necesita el servidor HTTP (Fastify) para arrancar:
 * los use cases que expondrá el controller y el logger para registrar trazas.
 *
 * El servidor no sabe nada de Postgres ni de memoria: solo recibe "casos de uso
 * ya construidos" y un logger. Esto se llama "Inyección de Dependencias por
 * constructor": el server depende de abstracciones, no de implementaciones.
 *
 * Fíjate: en unified-container.ts se construye un objeto que satisface este
 * contrato tanto si la BD es memoria como si es Postgres.
 */
import { CreateOrder } from '../use-cases/create-order.js'
import { AddItemToOrder } from '../use-cases/add-item-to-order.js'
import { Logger } from './logger.js'

export interface ServerDependencies {
  /** Caso de uso al que llamar desde `POST /orders`. */
  createOrderUseCase: CreateOrder
  /** Caso de uso al que llamar desde `POST /orders/:orderSku/items`. */
  addItemToOrderUseCase: AddItemToOrder
  /** Logger para registrar info/error durante el ciclo de vida del server. */
  logger: Logger
}