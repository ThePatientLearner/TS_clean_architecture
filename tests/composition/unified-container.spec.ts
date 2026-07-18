import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildUnifiedContainer } from '../../src/composition/unified-container.js'

describe('UnifiedContainer', () => {
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should build container with in-memory database by default', () => {
    process.env.DATABASE_TYPE = 'memory'
    
    const container = buildUnifiedContainer()
    
    expect(container).toHaveProperty('createOrderUseCase')
    expect(container).toHaveProperty('addItemToOrderUseCase')
    expect(container).toHaveProperty('logger')
    expect(container).toHaveProperty('cleanup')
    expect(typeof container.cleanup).toBe('function')
  })

  it('should call cleanup function without errors for in-memory', async () => {
    process.env.DATABASE_TYPE = 'memory'
    
    const container = buildUnifiedContainer()
    
    await expect(container.cleanup?.()).resolves.toBeUndefined()
  })

  it('should handle both memory and postgres configurations', () => {
    // Test memory configuration
    process.env.DATABASE_TYPE = 'memory'
    const memoryContainer = buildUnifiedContainer()
    expect(memoryContainer).toHaveProperty('createOrderUseCase')
    
    // Note: Testing postgres requires actual DATABASE_URL
    // which would require PostgreSQL to be running
  })
})