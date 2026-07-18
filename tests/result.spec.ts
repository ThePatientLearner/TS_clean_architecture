import { describe, it, expect } from 'vitest';
import { ok, fail, map, flatMap, combine } from '../src/shared/result.js';

describe('Result', () => {
  it('debe crear un resultado exitoso', () => {
    const result = ok(42);
    
    expect(result.isSuccess).toBe(true);
    expect(result.isFailure).toBe(false);
    
    if (result.isSuccess) {
      expect(result.value).toBe(42);
    }
  });
  
  it('debe crear un resultado fallido', () => {
    const error = new Error('Algo salió mal');
    const result = fail(error);
    
    expect(result.isSuccess).toBe(false);
    expect(result.isFailure).toBe(true);
    
    if (result.isFailure) {
      expect(result.error).toBe(error);
      expect(result.error.message).toBe('Algo salió mal');
    }
  });
  
  it('debe permitir mapear un resultado exitoso', () => {
    const result = ok(5);
    const mapped = map(result, value => value * 2);
    
    expect(mapped.isSuccess).toBe(true);
    if (mapped.isSuccess) {
      expect(mapped.value).toBe(10);
    }
  });
  
  it('debe mantener el error al mapear un resultado fallido', () => {
    const error = new Error('Error original');
    const result = fail(error);
    const mapped = map(result, value => value * 2);
    
    expect(mapped.isFailure).toBe(true);
    if (mapped.isFailure) {
      expect(mapped.error).toBe(error);
    }
  });
  
  it('debe encadenar operaciones con flatMap', () => {
    const divide = (a: number, b: number) => {
      if (b === 0) {
        return fail(new Error('División por cero'));
      }
      return ok(a / b);
    };
    
    const result = ok(10);
    const chained = flatMap(result, value => divide(value, 2));
    
    expect(chained.isSuccess).toBe(true);
    if (chained.isSuccess) {
      expect(chained.value).toBe(5);
    }
    
    const chainedError = flatMap(result, value => divide(value, 0));
    expect(chainedError.isFailure).toBe(true);
    if (chainedError.isFailure) {
      expect(chainedError.error.message).toBe('División por cero');
    }
  });
  
  it('debe combinar múltiples resultados', () => {
    const results = [ok(1), ok(2), ok(3)];
    const combined = combine(results);
    
    expect(combined.isSuccess).toBe(true);
    if (combined.isSuccess) {
      expect(combined.value).toEqual([1, 2, 3]);
    }
    
    const resultsWithError = [ok(1), fail(new Error('Error en el medio')), ok(3)];
    const combinedWithError = combine(resultsWithError);
    
    expect(combinedWithError.isFailure).toBe(true);
    if (combinedWithError.isFailure) {
      expect(combinedWithError.error.message).toBe('Error en el medio');
    }
  });
});
