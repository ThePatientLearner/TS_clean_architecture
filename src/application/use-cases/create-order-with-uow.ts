/**
 * application/use-cases/create-order-with-uow.ts — Variante de CreateOrder con UoW.
 *
 * Es la versión "transaccional" del caso de uso: en lugar de llamar directamente
 * a `orderRepository.save(...)`, delega en un UnitOfWork que abre una transacción
 * y le pasa los repositorios que la comparten.
 *
 * Diferencias con `create-order.ts`:
 *   - Usa `unitOfWork.run(async repos => {...})` para envolver la persistencia.
 *   - La publicación de eventos se hace FUERA de la transacción (ver comentario
 *     "Publish events outside of transaction" abajo).
 *
 * ¿Por qué publicar fuera? Si publicas dentro de la transacción y luego la
 * transacción falla por algún motivo, ya habrías enviado mensajes al exterior
 * sobre algo que finalmente no se persistió. Mejor: primero COMMIT, después
 * publica; si la publicación falla, puedes reintentar o compensar.
 */
import { Order } from '../../domain/entities/order.js';
import { SKU } from '../../domain/value-objects/sku.js';
import { Result, ok, fail } from '../../shared/result.js';
import { UnitOfWork } from '../ports/unit-of-work.js';
import { EventBus } from '../ports/event-bus.js';
import { CreateOrderDto } from '../dto/create-order-dto.js';
import { AppError, ValidationError } from '../errors.js';

export class CreateOrderWithUoW {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly eventBus: EventBus
  ) {}

  /**
   * @param dto Datos de entrada (orderSku).
   * @returns Ok(void) si la transacción hizo COMMIT y los eventos se publicaron.
   */
  async execute(dto: CreateOrderDto): Promise<Result<void, AppError>> {
    try {
      const orderSku = new SKU(dto.orderSku);

      // Bloque transaccional. Todo lo que se ejecute aquí dentro comparte la
      // misma conexión de BD. Si algo lanza, el UoW hace ROLLBACK automático.
      const result = await this.unitOfWork.run(async (repos) => {
        // Nota: en esta versión NO comprobamos si el pedido ya existe; cada
        // llamada crea uno nuevo. En un escenario real quizá quieras verificarlo.

        // Creamos la entidad (emite OrderCreated).
        const order = new Order(orderSku);

        // Guardamos usando el repo transaccional que viene en `repos`.
        const saveResult = await repos.orderRepository.save(order);
        if (!saveResult.success) {
          // Lanzamos el error para que el UoW haga ROLLBACK y nos lo devuelva
          // envuelto en Err(InfraError).
          throw saveResult.error;
        }

        // Devolvemos el order para usarlo tras el COMMIT (publicar eventos).
        return order;
      });

      if (!result.success) {
        return fail(result.error);
      }

      // Una vez confirmado el COMMIT, publicamos los eventos.
      // Si esto fallara, los datos YA están en BD; puedes reintentar o usar un
      // job que lea la tabla `outbox` (ver OutboxDispatcher).
      const order = result.data;
      const publishResult = await this.eventBus.publish(order.events);
      if (!publishResult.success) {
        return fail(publishResult.error);
      }

      return ok(undefined);
    } catch (error) {
      // Si llegamos aquí es porque algo "se nos escapó" del UoW (p.ej. validación).
      // Distinguimos AppError (lo propagamos tal cual) de Error genérico.
      if (error instanceof AppError) {
        return fail(error);
      }
      if (error instanceof Error) {
        return fail(new ValidationError(error.message));
      }
      return fail(new ValidationError('Unknown validation error'));
    }
  }
}