import { describe, it, expect } from 'vitest'
import { OutboxEventBus } from '../../src/infrastructure/messaging/outbox-event-bus.js'
import { DomainEvent } from '../../src/domain/events/domain-event.js'

class TestEvent extends DomainEvent {
  constructor(aggregateId: string, public readonly testData: string) {
    super(aggregateId)
  }
}

describe('OutboxEventBus', () => {
  it('should handle empty events array', async () => {
    const mockPool = {
      connect: () => ({
        query: () => Promise.resolve(),
        release: () => {}
      })
    } as any

    const eventBus = new OutboxEventBus(mockPool)
    const result = await eventBus.publish([])
    
    expect(result.isSuccess).toBe(true)
  })

  it('should extract aggregate type correctly', () => {
    const mockPool = {} as any
    const eventBus = new OutboxEventBus(mockPool)
    
    // Use reflection to access private method
    const extractAggregateType = (eventBus as any).extractAggregateType.bind(eventBus)
    
    const event = new TestEvent('test-id', 'test-data')
    const aggregateType = extractAggregateType(event)
    
    expect(aggregateType).toBe('Unknown')
  })

  it('should serialize event correctly', () => {
    const mockPool = {} as any
    const eventBus = new OutboxEventBus(mockPool)
    
    // Use reflection to access private method
    const serializeEvent = (eventBus as any).serializeEvent.bind(eventBus)
    
    const event = new TestEvent('test-id', 'test-data')
    const serialized = serializeEvent(event)
    
    expect(serialized).toHaveProperty('aggregateId', 'test-id')
    expect(serialized).toHaveProperty('occurredOn')
    expect(serialized).toHaveProperty('testData', 'test-data')
  })
})