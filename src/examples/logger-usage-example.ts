/**
 * examples/logger-usage-example.ts — Ejemplo de uso del Logger con contexto.
 *
 * No es parte de la app: es un archivo para ejecutar manualmente y ver
 * cómo funciona el "child logger" (cómo se hereda el contexto).
 *
 * Ejecútalo con:
 *   npx tsx src/examples/logger-usage-example.ts
 *
 * Verás que cada línea de log lleva `requestId`, `method`, `url`, etc.
 * sin tener que pasarlos manualmente a cada llamada.
 */
import { PinoLogger } from '../infrastructure/logging/pino-logger.js'

async function demonstrateLogging() {
  console.log('=== PinoLogger with Context Example ===\n')

  // 1. Logger raíz (sin contexto). Vive "fuera" de cualquier request.
  const rootLogger = new PinoLogger()

  // 2. Logs básicos con y sin objeto estructurado.
  rootLogger.info('Application starting')
  rootLogger.debug('Debug information', { version: '1.0.0' })

  // 3. Child logger con contexto "de request". Cada log de `requestLogger`
  //    llevará automáticamente requestId, method, url y userAgent.
  const requestLogger = rootLogger.child({
    requestId: 'req-123',
    method: 'POST',
    url: '/orders',
    userAgent: 'curl/7.68.0'
  })

  requestLogger.info('Request started')

  // 4. Otro nivel de child: ahora también con operation y orderSku.
  //    Pino "acumula" contextos, no los reemplaza.
  const operationLogger = requestLogger.child({
    operation: 'createOrder',
    orderSku: 'order-456'
  })

  operationLogger.info('Creating order', { customerId: 'cust-789' })

  // 5. Simulamos operaciones de un caso de uso real con varios logs.
  try {
    operationLogger.info('Validating order data')
    // Simular trabajo...
    await new Promise(resolve => setTimeout(resolve, 100))

    operationLogger.info('Order validation successful')
    operationLogger.info('Saving order to database')

    // Simular más trabajo...
    await new Promise(resolve => setTimeout(resolve, 50))

    operationLogger.info('Order created successfully', {
      orderId: 'ord-999',
      totalAmount: 99.99,
      currency: 'USD'
    })
  } catch (error) {
    operationLogger.error('Order creation failed', {
      error: (error as Error).message,
      stack: (error as Error).stack
    })
  }

  // requestLogger sigue "vivo" y útil para el log de fin de request.
  requestLogger.info('Request completed', {
    statusCode: 201,
    responseTimeMs: 150
  })

  console.log('\n=== Notice how each log entry includes the context! ===')
}

// Este truco (`import.meta.url === ...`) ejecuta la demo SOLO si lanzas
// este archivo directamente (`tsx examples/logger-usage-example.ts`).
// Si lo importas desde otro sitio, no hace nada.
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  demonstrateLogging().catch(console.error)
}