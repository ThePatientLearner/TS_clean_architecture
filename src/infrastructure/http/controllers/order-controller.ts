/**
 * infrastructure/http/controllers/order-controller.ts — Controller HTTP de pedidos.
 *
 * El controller es la capa más externa: traduce HTTP ↔ aplicación.
 * NO tiene lógica de negocio; solo:
 *   1. Parsea el body/params.
 *   2. Construye un DTO.
 *   3. Llama al use case correspondiente.
 *   4. Mapea el Result a un HTTP status code.
 *   5. Serializa la respuesta.
 *
 * Cada request crea un "child logger" con un requestId único. Así, TODOS
 * los logs de esa request llevan el mismo requestId, lo que permite
 * correlacionarlos en herramientas de observabilidad.
 *
 * `mapErrorToStatusCode` es el ÚNICO sitio donde AppError → HTTP status.
 * Si añades un AppError nuevo, también debes añadir su caso aquí.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { CreateOrder } from '../../../application/use-cases/create-order.js'
import { AddItemToOrder } from '../../../application/use-cases/add-item-to-order.js'
import { CreateOrderDto } from '../../../application/dto/create-order-dto.js'
import { AddItemToOrderDto } from '../../../application/dto/add-item-to-order-dto.js'
import { AppError } from '../../../application/errors.js'
import { Logger } from '../../../application/ports/logger.js'

/** Forma esperada del body de POST /orders. */
interface CreateOrderRequest {
  orderSku: string
}

/** Forma esperada del body de POST /orders/:orderSku/items. */
interface AddItemRequest {
  productSku: string
  quantity: number
}

/** Params de la ruta /orders/:orderSku/items. */
interface AddItemParams {
  orderSku: string
}

export class OrderController {
  constructor(
    private readonly createOrderUseCase: CreateOrder,
    private readonly addItemToOrderUseCase: AddItemToOrder,
    private readonly logger: Logger
  ) {}

  /**
   * Registra las rutas HTTP. Lo llama `buildServer` al arrancar.
   * `bind(this)` es necesario porque Fastify invocará el handler sin
   * preservar el `this`. Sin bind, `this.logger` sería undefined.
   */
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.post('/orders', this.createOrder.bind(this))
    fastify.post('/orders/:orderSku/items', this.addItem.bind(this))
  }

  /**
   * Handler de POST /orders.
   * Body esperado: { orderSku: string }
   * Respuestas:
   *   201 → creado
   *   400 → ValidationError
   *   409 → ConflictError (SKU duplicado)
   *   503 → InfraError
   */
  private async createOrder(
    request: FastifyRequest<{ Body: CreateOrderRequest }>,
    reply: FastifyReply
  ): Promise<void> {
    // UUID por request → trazabilidad en logs.
    const requestId = randomUUID()
    const logger = this.logger.child({
      requestId,
      operation: 'createOrder',
      method: request.method,
      url: request.url
    })

    logger.info('Creating order', { orderSku: request.body.orderSku })

    // Construimos el DTO que el caso de uso espera.
    const dto: CreateOrderDto = {
      orderSku: request.body.orderSku
    }

    const result = await this.createOrderUseCase.execute(dto)

    if (!result.success) {
      // Mapeo de error de dominio → HTTP status.
      const statusCode = this.mapErrorToStatusCode(result.error)

      logger.error('Order creation failed', {
        orderSku: request.body.orderSku,
        error: result.error.type,
        message: result.error.message,
        statusCode
      })

      reply.code(statusCode).send({
        error: result.error.type,
        message: result.error.message
      })
      return
    }

    logger.info('Order created successfully', { orderSku: request.body.orderSku })
    reply.code(201).send({ message: 'Order created successfully' })
  }

  /**
   * Handler de POST /orders/:orderSku/items.
   * Body esperado: { productSku: string, quantity: number }
   * Respuestas:
   *   200 → añadido
   *   400 → ValidationError
   *   404 → NotFoundError (pedido no existe o precio no existe)
   *   503 → InfraError
   */
  private async addItem(
    request: FastifyRequest<{
      Params: AddItemParams
      Body: AddItemRequest
    }>,
    reply: FastifyReply
  ): Promise<void> {
    const requestId = randomUUID()
    const logger = this.logger.child({
      requestId,
      operation: 'addItem',
      method: request.method,
      url: request.url
    })

    logger.info('Adding item to order', {
      orderSku: request.params.orderSku,
      productSku: request.body.productSku,
      quantity: request.body.quantity
    })

    // Mezclamos params (URL) + body en un único DTO.
    const dto: AddItemToOrderDto = {
      orderSku: request.params.orderSku,
      productSku: request.body.productSku,
      quantity: request.body.quantity
    }

    const result = await this.addItemToOrderUseCase.execute(dto)

    if (!result.success) {
      const statusCode = this.mapErrorToStatusCode(result.error)

      logger.error('Adding item to order failed', {
        orderSku: request.params.orderSku,
        productSku: request.body.productSku,
        quantity: request.body.quantity,
        error: result.error.type,
        message: result.error.message,
        statusCode
      })

      reply.code(statusCode).send({
        error: result.error.type,
        message: result.error.message
      })
      return
    }

    logger.info('Item added successfully', {
      orderSku: request.params.orderSku,
      productSku: request.body.productSku,
      quantity: request.body.quantity
    })

    reply.code(200).send({ message: 'Item added successfully' })
  }

  /**
   * Mapea el `type` de un AppError a su HTTP status code equivalente.
   * Es el ÚNICO punto donde la aplicación "conoce" los códigos HTTP.
   * Añadir un nuevo AppError = añadir un nuevo case aquí.
   */
  private mapErrorToStatusCode(error: AppError): number {
    switch (error.type) {
      case 'VALIDATION_ERROR':
        return 400
      case 'NOT_FOUND_ERROR':
        return 404
      case 'CONFLICT_ERROR':
        return 409
      case 'INFRA_ERROR':
        return 503
      default:
        return 500 // fallback por si se añade un error sin mapear
    }
  }
}