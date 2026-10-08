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

  it('accepts a leap-day date in a leap year', () => {
    expect(validateStaticValue('2024-02-29', 'date').valid).toBe(true)
  })

  // PR #189 review: Date.parse silently rolls these over into the next valid
  // calendar date instead of rejecting them.
  it('rejects a day that does not exist in the given month', () => {
    const result = validateStaticValue('2026-02-30', 'date')
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('rejects February 29 in a non-leap year', () => {
    expect(validateStaticValue('2026-02-29', 'date').valid).toBe(false)
  })

  it('rejects a month number above 12', () => {
    expect(validateStaticValue('2026-13-01', 'date').valid).toBe(false)
  })

  it('rejects a month number of 00', () => {
    expect(validateStaticValue('2026-00-15', 'date').valid).toBe(false)
  })

  it('rejects a day number of 00', () => {
    expect(validateStaticValue('2026-10-00', 'date').valid).toBe(false)
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

  // PR #189 review: these all pass isFinite(Number(...)) but are not
  // themselves valid JSONata number literals — rejected outright rather than
  // silently rewritten, so what the Technical Administrator sees is always
  // exactly what gets stored and exported.
  it('rejects number forms that are not valid JSONata literals', () => {
    for (const input of ['1.', '.5', '+5', '007', '0x1A']) {
      const result = validateStaticValue(input, 'number')
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
    }
  })

  it('accepts negative numbers and exponent notation', () => {
    expect(validateStaticValue('-5', 'number').valid).toBe(true)
    expect(validateStaticValue('0', 'number').valid).toBe(true)
    expect(validateStaticValue('1e10', 'number').valid).toBe(true)
    expect(validateStaticValue('1.5e-3', 'number').valid).toBe(true)
  })
})
