import { describe, it, expect } from 'vitest'
import { validateStaticValue, supportsStaticValue } from '../validateStaticValue'

describe('supportsStaticValue', () => {
  it('returns true for the scalar types', () => {
    expect(supportsStaticValue('string')).toBe(true)
    expect(supportsStaticValue('number')).toBe(true)
    expect(supportsStaticValue('boolean')).toBe(true)
    expect(supportsStaticValue('date')).toBe(true)
  })

  it('returns false for object, array, and unknown', () => {
    expect(supportsStaticValue('object')).toBe(false)
    expect(supportsStaticValue('array')).toBe(false)
    expect(supportsStaticValue('unknown')).toBe(false)
  })
})

describe('validateStaticValue', () => {
  // Scenario: A static value matching the target type resolves the problem
  it('accepts a string value', () => {
    expect(validateStaticValue('actief', 'string')).toEqual({ valid: true, error: null })
  })

  it('accepts an integer value for a number target', () => {
    expect(validateStaticValue('42', 'number')).toEqual({ valid: true, error: null })
  })

  it('accepts a float value for a number target', () => {
    expect(validateStaticValue('3.14', 'number')).toEqual({ valid: true, error: null })
  })

  it('accepts "true" and "false" for a boolean target', () => {
    expect(validateStaticValue('true', 'boolean')).toEqual({ valid: true, error: null })
    expect(validateStaticValue('false', 'boolean')).toEqual({ valid: true, error: null })
  })

  it('accepts an ISO date for a date target', () => {
    expect(validateStaticValue('2026-10-07', 'date')).toEqual({ valid: true, error: null })
  })

  // Scenario: A static value that does not match the target type is rejected
  it('rejects a non-numeric value for a number target', () => {
    const result = validateStaticValue('hello', 'number')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects a non-boolean value for a boolean target', () => {
    const result = validateStaticValue('yes', 'boolean')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects an invalid date for a date target', () => {
    const result = validateStaticValue('not-a-date', 'date')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects a string value longer than the target maxLength', () => {
    const result = validateStaticValue('hello world', 'string', { maxLength: 5 })
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects an empty value', () => {
    const result = validateStaticValue('   ', 'string')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
