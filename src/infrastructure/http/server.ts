/**
 * infrastructure/http/server.ts — Construye la aplicación Fastify.
 *
 * Fastify es el framework HTTP. Esta función:
 *   1. Crea la instancia del server (con `logger: false` para usar NUESTRO logger, no el suyo).
 *   2. Instancia el OrderController con sus use cases inyectados.
 *   3. Registra las rutas del controller.
 *   4. Añade una ruta de health-check.
 *
 * `logger: false` desactiva el logger interno de Fastify porque ya tenemos
 * PinoLogger en nuestra capa de aplicación. Así no duplicamos logs.
 *
 * NOTA: el `loggingPlugin` definido en ./plugins/logging-plugin.ts existe pero
 * no se registra aquí todavía. Si quisieras activarlo:
 *   await fastify.register(loggingPlugin, { logger: dependencies.logger })
 *
 * Devuelve la instancia de Fastify lista para `server.listen(...)` en main.ts.
 */
import fastify from 'fastify'
import { ServerDependencies } from '../../application/ports/server-dependencies.js'
import { OrderController } from './controllers/order-controller.js'

export async function buildServer(dependencies: ServerDependencies) {
  // Creamos Fastify con su logger apagado: usaremos el nuestro (PinoLogger).
  const server = fastify({
    logger: false
  })

  // Capa de presentación: instanciamos el controller con los use cases.
  const orderController = new OrderController(
    dependencies.createOrderUseCase,
    dependencies.addItemToOrderUseCase,
    dependencies.logger
  )

  // Registramos las rutas: POST /orders y POST /orders/:orderSku/items.
  await orderController.registerRoutes(server)

  // Health check: ruta simple para que load balancers / k8s puedan
  // comprobar que el proceso responde.
  server.get('/health', async () => {
    dependencies.logger.info('Health check requested')
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Devolvemos la instancia sin hacer listen (eso lo hace main.ts).
  return server
}