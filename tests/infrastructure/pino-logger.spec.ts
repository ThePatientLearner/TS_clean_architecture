import { describe, it, expect, vi } from 'vitest'
import pino from 'pino'
import { PinoLogger } from '../../src/infrastructure/logging/pino-logger.js'

describe('PinoLogger', () => {
  it('should create a child logger with context', () => {
    const mockPino = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        child: vi.fn()
      })
    } as any

    const logger = new PinoLogger(mockPino)
    const childLogger = logger.child({ requestId: '123', operation: 'test' })

    expect(mockPino.child).toHaveBeenCalledWith({ requestId: '123', operation: 'test' })
    expect(childLogger).toBeInstanceOf(PinoLogger)
  })

  it('should log info messages', () => {
    const mockPino = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn()
    } as any

    const logger = new PinoLogger(mockPino)
    
    logger.info('Test message')
    expect(mockPino.info).toHaveBeenCalledWith('Test message')
    
    logger.info('Test with object', { key: 'value' })
    expect(mockPino.info).toHaveBeenCalledWith({ key: 'value' }, 'Test with object')
  })

  it('should log error messages', () => {
    const mockPino = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      child: vi.fn()
    } as any

    const logger = new PinoLogger(mockPino)
    
    logger.error('Error message')
    expect(mockPino.error).toHaveBeenCalledWith('Error message')
    
    logger.error('Error with object', { error: 'details' })
    expect(mockPino.error).toHaveBeenCalledWith({ error: 'details' }, 'Error with object')
  })
})