/**
 * infrastructure/http/plugins/logging-plugin.ts — Plugin de logging HTTP para Fastify.
 *
 * Un plugin de Fastify encapsula lógica transversal (logging, auth, CORS...)
 * en una función que se "enchufa" al servidor. Aquí lo definimos pero
 * ACTUALMENTE NO SE REGISTRA en `buildServer` (ver server.ts).
 *
 * Hooks de Fastify que usamos:
 *   - onRequest  → al recibir la petición, antes de cualquier handler.
 *   - onResponse → justo antes de enviar la respuesta al cliente.
 *   - onError    → cuando un handler lanza una excepción.
 *
 * `declare module 'fastify'` (augmentación de tipos) le dice a TS:
 * "FastifyRequest tiene una propiedad `logger` de tipo Logger". Esto
 * permite que en cualquier handler hagas `request.logger.info(...)`
 * sin tener que crear un child nuevo cada vez.
 */
import { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID } from 'crypto'
import { Logger } from '../../../application/ports/logger.js'

// "Module augmentation" de TS: extendemos el tipo FastifyRequest con
// nuestra propia propiedad `logger`. Sin esto, `request.logger` daría error de tipos.
declare module 'fastify' {
  interface FastifyRequest {
    logger: Logger
  }
}

export async function loggingPlugin(fastify: FastifyInstance, opts: { logger: Logger }) {
  /**
   * Hook al iniciar la petición: asignamos a `request.logger` un child logger
   * con requestId, método, URL y user-agent. Todos los logs posteriores de
   * esa request llevan automáticamente este contexto.
   */
  fastify.addHook('onRequest', async (request: FastifyRequest) => {
    const requestId = randomUUID()

    request.logger = opts.logger.child({
      requestId,
      method: request.method,
      url: request.url,
      userAgent: request.headers['user-agent']
    })

    request.logger.info('Request started')
  })

  /**
   * Hook al enviar la respuesta: logueamos status y duración.
   * `reply.getResponseTime()` devuelve milisegundos desde el onRequest.
   */
  fastify.addHook('onResponse', async (request: FastifyRequest, reply) => {
    const responseTime = reply.getResponseTime()

    request.logger.info('Request completed', {
      statusCode: reply.statusCode,
      responseTimeMs: Math.round(responseTime)
    })
  })

  /**
   * Hook de error: captura excepciones lanzadas por cualquier handler.
   * Loguea con stack trace para debugging.
   */
  fastify.addHook('onError', async (request: FastifyRequest, reply, error) => {
    request.logger.error('Request failed', {
      error: error.message,
      stack: error.stack,
      statusCode: reply.statusCode
    })
  })
}