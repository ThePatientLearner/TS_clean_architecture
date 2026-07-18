/**
 * infrastructure/messaging/outbox-dispatcher.ts — Worker del patrón Outbox.
 *
 * Este es el "lado B" del patrón Outbox:
 *   - OutboxEventBus → escribe eventos en la tabla `outbox`.
 *   - OutboxDispatcher → lee esos eventos y los publica al broker REAL.
 *
 * El dispatcher se ejecuta como un PROCESO SEPARADO (`npm run worker:outbox`).
 * Hace polling cada `intervalMs` milisegundos:
 *   1. SELECT de eventos no publicados (published_at IS NULL), con SKIP LOCKED
 *      para que múltiples dispatchers puedan correr en paralelo sin pisarse.
 *   2. "Publica" cada evento (en este proyecto: solo log; en real: Kafka/RabbitMQ).
 *   3. UPDATE published_at = NOW() para marcarlos como enviados.
 *   4. COMMIT (todo en una transacción para no perder progreso).
 *
 * Si una iteración falla, hace ROLLBACK y vuelve a probar en el siguiente ciclo.
 */
import { Pool } from 'pg'
import { DatabaseFactory } from '../database/database-factory.js'

/** Forma de una fila de la tabla `outbox` al hacer SELECT. */
interface OutboxEvent {
  id: string
  aggregate_id: string
  aggregate_type: string
  event_type: string
  event_data: object
  created_at: Date
}

export class OutboxDispatcher {
  private readonly pool: Pool
  private isRunning = false
  private batchSize: number
  private intervalMs: number

  /**
   * @param batchSize  Eventos máx. a procesar por ciclo (default 100).
   * @param intervalMs Milisegundos entre ciclos (default 5000).
   */
  constructor(batchSize = 100, intervalMs = 5000) {
    this.pool = DatabaseFactory.createPool()
    this.batchSize = batchSize
    this.intervalMs = intervalMs
  }

  /**
   * Bucle principal: processUnpublishedEvents() + sleep, hasta que alguien
   * llame a stop(). Diseñado para correr indefinidamente.
   */
  async start(): Promise<void> {
    // Idempotente: si ya está corriendo, no hace nada.
    if (this.isRunning) {
      console.log('Outbox dispatcher is already running')
      return
    }

    this.isRunning = true
    console.log('Starting outbox dispatcher...')

    while (this.isRunning) {
      try {
        await this.processUnpublishedEvents()
        await this.sleep(this.intervalMs)
      } catch (error) {
        // Si algo falla, esperamos el mismo intervalo y reintentamos.
        // En producción quizá quieras backoff exponencial.
        console.error('Error in outbox dispatcher:', error)
        await this.sleep(this.intervalMs)
      }
    }
  }

  /** Señala al bucle que pare en la siguiente iteración. */
  stop(): void {
    console.log('Stopping outbox dispatcher...')
    this.isRunning = false
  }

  /**
   * Una pasada: coge hasta `batchSize` eventos sin publicar, los "publica"
   * y los marca como enviados. Todo dentro de una transacción.
   */
  private async processUnpublishedEvents(): Promise<void> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      // SELECT ... FOR UPDATE SKIP LOCKED:
      //   - FOR UPDATE   → bloquea las filas seleccionadas para que otros
      //                    dispatchers no las cojan a la vez.
      //   - SKIP LOCKED  → si otro dispatcher YA las tiene, las salta
      //                    (no espera al lock). Permite paralelismo seguro.
      // Filtramos por published_at IS NULL: solo eventos pendientes.
      const selectQuery = `
        SELECT id, aggregate_id, aggregate_type, event_type, event_data, created_at
        FROM outbox
        WHERE published_at IS NULL
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      `

      const result = await client.query(selectQuery, [this.batchSize])
      const events: OutboxEvent[] = result.rows

      // Nada que hacer → COMMIT vacío y salimos.
      if (events.length === 0) {
        await client.query('COMMIT')
        return
      }

      console.log(`Processing ${events.length} unpublished events`)

      // Publicamos uno a uno. Si cualquiera falla, lanzamos y hacemos ROLLBACK:
      // así ningún evento queda marcado como publicado a medias.
      for (const event of events) {
        try {
          await this.publishEvent(event)
          console.log(`Published event ${event.id} of type ${event.event_type}`)
        } catch (error) {
          console.error(`Failed to publish event ${event.id}:`, error)
          throw error // fuerza el ROLLBACK
        }
      }

      // Marcamos todos los eventos del batch como publicados.
      const eventIds = events.map(e => e.id)
      const updateQuery = `
        UPDATE outbox
        SET published_at = NOW()
        WHERE id = ANY($1)
      `

      await client.query(updateQuery, [eventIds])
      await client.query('COMMIT')

      console.log(`Marked ${events.length} events as published`)
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      // Devolvemos SIEMPRE el cliente al pool.
      client.release()
    }
  }

  /**
   * "Publica" un evento. Aquí solo lo logamos. En un sistema real aquí iría
   * la integración con el broker: rabbitmq.publish(), kafka.send(), sqs.send(), etc.
   */
  private async publishEvent(event: OutboxEvent): Promise<void> {
    console.log(`Publishing event: ${event.event_type} for aggregate ${event.aggregate_type}:${event.aggregate_id}`)

    // Aquí iría la integración con tu message broker (RabbitMQ, Kafka, SQS...).
    // Por ahora solo logueamos el evento para que se vea en consola.
    console.log('Event data:', JSON.stringify(event.event_data, null, 2))

    // Simulamos latencia de red (10ms).
    await this.sleep(10)
  }

  /** `setTimeout` envuelto en promesa para poder hacer `await sleep(ms)`. */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

/**
 * Runner para CLI. Se ejecuta solo si este archivo se llama directamente
 * (`tsx src/infrastructure/messaging/outbox-dispatcher.ts`).
 */
async function runDispatcher() {
  const dispatcher = new OutboxDispatcher()

  // Graceful shutdown del worker al recibir SIGINT/SIGTERM.
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...')
    dispatcher.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...')
    dispatcher.stop()
    process.exit(0)
  })

  try {
    await dispatcher.start()
  } catch (error) {
    console.error('Failed to start outbox dispatcher:', error)
    process.exit(1)
  }
}

// `import.meta.url === new URL(process.argv[1], 'file://').href` es la forma
// estándar en módulos ES de saber si un archivo se está ejecutando directamente.
// Si lo lanzas con `tsx outbox-dispatcher.ts`, ejecuta runDispatcher().
// Si lo importas desde otro archivo (p.ej. un test), no hace nada.
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  runDispatcher()
}