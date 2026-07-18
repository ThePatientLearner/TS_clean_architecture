/**
 * examples/outbox-usage-example.ts — Ejemplo del patrón Outbox.
 *
 * Ejecuta manualmente con:
 *   npx tsx src/examples/outbox-usage-example.ts
 *
 * Requiere Postgres corriendo y la tabla `outbox` creada (mira
 * db/migrations/001_init.sql y `npm run db:migrate`).
 *
 * Demuestra dos cosas:
 *   1. OutboxEventBus → publica eventos a la tabla `outbox` (no al broker).
 *   2. OutboxDispatcher → worker que lee la tabla y "publicaría" al broker real.
 */
import { MessagingFactory } from '../infrastructure/messaging/messaging-factory.js'
import { OrderCreated } from '../domain/events/order-created.js'

async function exampleEventBusUsage() {
  console.log('=== EventBus with Outbox Pattern Example ===\n')

  // 1. Pedimos al factory un EventBus de tipo 'outbox'.
  const eventBus = MessagingFactory.createEventBus('outbox')

  // 2. Creamos dos eventos de ejemplo.
  const events = [
    new OrderCreated('order-123'),
    new OrderCreated('order-124')
  ]

  // 3. Publicamos: el bus inserta filas en la tabla `outbox`.
  //    NUNCA contacta con un broker externo aquí.
  console.log('Publishing events to outbox...')
  const result = await eventBus.publish(events)

  if (result.isSuccess) {
    console.log('✅ Events successfully stored in outbox table')
  } else {
    console.log('❌ Failed to store events:', result.error.message)
  }

  console.log('\n=== OutboxDispatcher Example ===\n')

  // 4. Creamos el dispatcher con batch pequeño (10) e intervalo corto (2s).
  //    Así verás logs frecuentes al ejecutarlo.
  console.log('Creating outbox dispatcher...')
  const dispatcher = MessagingFactory.createOutboxDispatcher(10, 2000)

  console.log('Starting dispatcher (will process unpublished events)...')
  console.log('Press Ctrl+C to stop\n')

  // Arranca el bucle infinito. Solo sale cuando reciba SIGINT.
  await dispatcher.start()
}

// Mismo truco: ejecuta solo si lo lanzas directamente.
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  exampleEventBusUsage().catch(console.error)
}