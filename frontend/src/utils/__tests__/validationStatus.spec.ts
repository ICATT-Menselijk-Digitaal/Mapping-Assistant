import { describe, it, expect } from 'vitest'
import { getValidationStatus } from '../validationStatus'
import type { SchemaField } from '@/types'

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    id: 'f1',
    name: 'field',
    path: 'field',
    dataType: 'string',
    required: false,
    ...overrides,
  }
}

describe('getValidationStatus', () => {
  // Scenario: Same-type fields are compatible
  it('returns compatible for same-type fields', () => {
    expect(getValidationStatus(field({ dataType: 'string' }), field({ dataType: 'string' }))).toBe('compatible')
  })

  // Scenario: Castable type pair (number to string) is compatible
  it('returns compatible for number → string', () => {
    expect(getValidationStatus(field({ dataType: 'number' }), field({ dataType: 'string' }))).toBe('compatible')
  })

  // Scenario: String-to-string with source maxLength exceeding target maxLength is constrained
  it('returns constrained when source maxLength exceeds target maxLength', () => {
    expect(
      getValidationStatus(
        field({ dataType: 'string', maxLength: 100 }),
        field({ dataType: 'string', maxLength: 50 }),
      ),
    ).toBe('constrained')
  })

  // Scenario: String-to-string where target maxLength is undefined is compatible
  it('returns compatible when target maxLength is undefined', () => {
    expect(
      getValidationStatus(
        field({ dataType: 'string', maxLength: 100 }),
        field({ dataType: 'string' }),
      ),
    ).toBe('compatible')
  })

  // Scenario: Either field has type unknown is constrained
  it('returns constrained when source type is unknown', () => {
    expect(getValidationStatus(field({ dataType: 'unknown' }), field({ dataType: 'string' }))).toBe('constrained')
  })

  it('returns constrained when target type is unknown', () => {
    expect(getValidationStatus(field({ dataType: 'string' }), field({ dataType: 'unknown' }))).toBe('constrained')
  })

  // Scenario: Structurally incompatible types are incompatible
  it('returns incompatible for object → string', () => {
    expect(getValidationStatus(field({ dataType: 'object' }), field({ dataType: 'string' }))).toBe('incompatible')
  })

  it('returns incompatible for array → number', () => {
    expect(getValidationStatus(field({ dataType: 'array' }), field({ dataType: 'number' }))).toBe('incompatible')
  })

  it('returns incompatible for boolean → date', () => {
    expect(getValidationStatus(field({ dataType: 'boolean' }), field({ dataType: 'date' }))).toBe('incompatible')
  })
})
