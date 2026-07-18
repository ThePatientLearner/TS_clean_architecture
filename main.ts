/**
 * main.ts — Punto de entrada de la aplicación.
 *
 * Aquí solo se hace "Composition Root": se leen variables de entorno, se
 * construye el contenedor de dependencias (DI) y se arranca el servidor HTTP.
 * No hay lógica de negocio aquí; eso vive en capas internas (domain/application).
 *
 * Flujo general:
 *   1. buildUnifiedContainer()  -> crea repos, use cases, logger, event bus, etc.
 *   2. buildServer(deps)        -> instancia Fastify y registra rutas.
 *   3. server.listen(...)       -> abre el puerto y empieza a aceptar requests.
 *   4. cleanup()                -> cierre limpio al recibir SIGTERM/SIGINT.
 */

import { buildServer } from './src/infrastructure/http/server.js'
import { buildUnifiedContainer } from './src/composition/unified-container.js'
import { config } from './src/composition/config.js'
import { FastifyInstance } from 'fastify'

// Variables globales para que los handlers de señales (SIGTERM/SIGINT) puedan
// acceder a ellas. Se inicializan dentro de main() y se limpian en cleanup().
let server: FastifyInstance | null = null
// `Awaited<ReturnType<...>>` saca el tipo de retorno de buildUnifiedContainer()
// una vez resuelta la promesa. Como aquí NO es async, simplemente es el tipo
// que devuelve la función (un objeto con todas las dependencias inyectadas).
let dependencies: Awaited<ReturnType<typeof buildUnifiedContainer>> | null = null

/**
 * Arranca la aplicación: compone las dependencias, monta el servidor HTTP y
 * lo pone a escuchar. Si algo falla, ejecuta cleanup() y termina el proceso.
 */
async function main() {
  try {
    console.log(`🚀 Starting application in ${config.NODE_ENV} mode`)
    console.log(`📊 Database type: ${config.DATABASE_TYPE}`)

    // Paso 1 — Composition Root (Inyección de Dependencias).
    // buildUnifiedContainer decide qué implementación usar (memoria o Postgres)
    // en función de config.DATABASE_TYPE. Ver src/composition/unified-container.ts.
    dependencies = buildUnifiedContainer()
    dependencies.logger.info('Dependencies initialized')

    // Paso 2 — Construir el servidor Fastify pasándole las dependencias.
    // El servidor registra rutas (controllers) que usan los use cases.
    server = await buildServer(dependencies)
    dependencies.logger.info('Server built successfully')

    const host = process.env.HOST || '0.0.0.0'
    const port = config.PORT

    // Paso 3 — Abrir el puerto. A partir de aquí el server acepta peticiones.
    await server.listen({ host, port })

    dependencies.logger.info('Server started successfully', { host, port })
    console.log(`🚀 Server running at http://${host}:${port}`)
    console.log(`📋 Health check: http://${host}:${port}/health`)
    console.log(`📦 Orders API: http://${host}:${port}/orders`)
} catch (error) {
    // Si falla el arranque, lo logamos e intentamos cerrar todo limpio.
    console.error('❌ Failed to start server:', error)
    if (dependencies?.logger) {
      dependencies.logger.error('Server startup failed', { error: (error as Error).message })
    }
    await cleanup()
    process.exit(1)
  }
}

/**
 * Cierra ordenadamente: primero el servidor HTTP (deja de aceptar conexiones)
 * y luego las dependencias (pools de BD, etc.). Se ejecuta en errores y en
 * señales de terminación para no dejar conexiones abiertas.
 */
async function cleanup() {
  console.log('🧹 Starting cleanup process...')

  try {
    // Cerrar el servidor HTTP primero.
    if (server) {
      console.log('📡 Closing HTTP server...')
      await server.close()
      console.log('✅ HTTP server closed')
    }

    // Cerrar dependencias (pool de Postgres, etc.). En modo memoria es no-op.
    if (dependencies?.cleanup) {
      console.log('🗃️ Cleaning up dependencies...')
      await dependencies.cleanup()
      console.log('✅ Dependencies cleaned up')
    }

    console.log('✅ Cleanup completed successfully')
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    if (dependencies?.logger) {
      dependencies.logger.error('Cleanup failed', { error: (error as Error).message })
    }
  }
}

// Manejo de cierre "graceful shutdown": cuando llega SIGTERM (kill, k8s, etc.)
// o SIGINT (Ctrl+C), cerramos limpio en vez de cortar el proceso en seco.
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...')
  if (dependencies?.logger) {
    dependencies.logger.info('SIGTERM received, initiating graceful shutdown')
  }
  await cleanup()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...')
  if (dependencies?.logger) {
    dependencies.logger.info('SIGINT received, initiating graceful shutdown')
  }
  await cleanup()
  process.exit(0)
})

// Rechazo de promesa no manejado: lo logamos pero dejamos el proceso vivo.
// En un sistema real quizá quieras terminar el proceso aquí también.
process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Promise Rejection:', reason)
  if (dependencies?.logger) {
    dependencies.logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined
    })
  }
})

// Excepción no capturada: muy grave, logamos, limpiamos y salimos con código 1.
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error)
  if (dependencies?.logger) {
    dependencies.logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    })
  }
  cleanup().finally(() => {
    process.exit(1)
  })
}

// Llamada final: ejecuta main(). El .catch es por si main() lanza antes
// de llegar al try/catch interno (poco probable, pero defensivo).
main().catch(async (error) => {
  console.error('💥 Unhandled error in main:', error)
  if (dependencies?.logger) {
    dependencies.logger.error('Main function failed', { error: error.message })
  }
  await cleanup()
  process.exit(1)
})