/**
 * infrastructure/messaging/outbox-event-bus.ts — EventBus con patrón Outbox.
 *
 * El PATRÓN OUTBOX consiste en NO publicar eventos directamente a un broker
 * externo (RabbitMQ, Kafka, SQS...). En su lugar, los GUARDAS en una tabla
 * de tu propia BD (`outbox`) en la MISMA transacción que los datos de negocio.
 *
 * ¿Por qué? Atomicidad: si guardas el pedido y la BD se cae justo después
 * de publicar el evento a RabbitMQ, has publicado algo que no existe.
 * Con Outbox, ambas cosas (pedido + evento) están en la misma transacción:
 * o ambas se aplican, o ninguna.
 *
 * Luego, un worker separado (OutboxDispatcher) lee la tabla outbox y publica
 * los eventos al broker real con reintentos.
 *
 * Esta clase SOLO persiste en la tabla. NO publica al broker.
 */
import { Pool } from 'pg'
import { randomUUID, createHash } from 'crypto'
import { DomainEvent } from '../../domain/events/domain-event.js'
import { Result, ok, fail } from '../../shared/result.js'
import { EventBus } from '../../application/ports/event-bus.js'
import { AppError, InfraError } from '../../application/errors.js'

/** Forma de una fila de la tabla `outbox`. */
interface OutboxRecord {
  id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  event_data: object
  created_at: Date
}

export class OutboxEventBus implements EventBus {
  constructor(private readonly pool: Pool) {}

  /**
   * Persiste los eventos en la tabla `outbox`. Se considera éxito si la
   * query no falla: una vez en BD, el dispatcher los publicará cuando pueda.
   */
  async publish(events: DomainEvent[]): Promise<Result<void, AppError>> {
    // Caso vacío: nada que hacer (evitamos abrir conexión al pool en balde).
    if (events.length === 0) {
      return ok(undefined)
    }

    const client = await this.pool.connect()

    try {
      // Convertimos cada DomainEvent a un OutboxRecord (fila SQL).
      const outboxRecords: OutboxRecord[] = events.map(event => ({
        id: randomUUID(),
        aggregate_id: this.generateUuidFromSku(event.aggregateId),
        aggregate_type: this.extractAggregateType(event),
        event_type: event.constructor.name, // p.ej. "OrderCreated", "ItemAddedToOrder"
        event_data: this.serializeEvent(event),
        created_at: event.occurredOn
      }))

      // Construimos un INSERT multi-fila con N tuplas de 6 placeholders cada una.
      // Es más eficiente que N INSERTs separados (una sola round-trip a la BD).
      const query = `
        INSERT INTO outbox (id, aggregate_id, aggregate_type, event_type, event_data, created_at)
        VALUES ${outboxRecords.map((_, index) =>
          `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${index * 6 + 4}, $${index * 6 + 5}, $${index * 6 + 6})`
        ).join(', ')}
      `

      // `.flatMap` aplana los arrays de cada record en uno solo de parámetros.
      const params = outboxRecords.flatMap(record => [
        record.id,
        record.aggregate_id,
        record.aggregate_type,
        record.event_type,
        JSON.stringify(record.event_data), // event_data es JSONB en la tabla
        record.created_at
      ])

      await client.query(query, params)

      return ok(undefined)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown outbox persistence error'
      return fail(new InfraError(`Failed to persist events to outbox: ${errorMessage}`))
    } finally {
      // SIEMPRE devolvemos el cliente al pool, incluso si hubo error.
      client.release()
    }
  }

  /**
   * Heurística simple para sacar el "tipo de agregado" del nombre de la clase
   * del evento: si el nombre contiene "Order", asumimos que es de un Order.
   * En un sistema real, esto debería ser un campo explícito en el evento.
   */
  private extractAggregateType(event: DomainEvent): string {
    const eventName = event.constructor.name

    if (eventName.includes('Order')) {
      return 'Order'
    }

    return 'Unknown'
  }

  /**
   * Serializa un evento a un objeto plano. Quitamos aggregateId y occurredOn
   * porque ya van en columnas separadas de la tabla; en event_data guardamos
   * el "payload" específico del evento.
   */
  private serializeEvent(event: DomainEvent): object {
    return {
      aggregateId: event.aggregateId,
      occurredOn: event.occurredOn.toISOString(),
      ...this.getEventPayload(event)
    }
  }

  /**
   * Saca las propiedades "propias" del evento (no las del padre DomainEvent).
   * `{ ...event }` copia todas las propiedades enumerables; luego borramos
   * las del padre con `delete`.
   */
  private getEventPayload(event: DomainEvent): object {
    const payload = { ...event }

    delete (payload as any).aggregateId
    delete (payload as any).occurredOn

    return payload
  }

  /**
   * Convierte el aggregateId (que aquí es un SKU humano) a un UUID v4
   * determinista. Misma técnica que en PostgresOrderRepository.
   */
  private generateUuidFromSku(sku: string): string {
    const hash = createHash('sha256').update(sku).digest('hex');
    return [
      hash.substring(0, 8),
      hash.substring(8, 12),
      '4' + hash.substring(13, 16), // Version 4
      '8' + hash.substring(17, 20), // Variant bits
      hash.substring(20, 32)
    ].join('-');
  }
}