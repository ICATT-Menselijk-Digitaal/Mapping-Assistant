import { describe, it, expect } from 'vitest'
import { isTypeCompatible } from '../typeCompatibility'
import type { SchemaField } from '@/types'

function field(dataType: SchemaField['dataType']): SchemaField {
  return { id: crypto.randomUUID(), name: 'field', path: 'field', dataType, required: false }
}

describe('isTypeCompatible', () => {
  it('incompatible types (string → number) return false', () => {
    expect(isTypeCompatible(field('string'), field('number'))).toBe(false)
  })

  it('compatible types (string → string) return true', () => {
    expect(isTypeCompatible(field('string'), field('string'))).toBe(true)
  })

  it('unknown source type returns false', () => {
    expect(isTypeCompatible(field('unknown'), field('string'))).toBe(false)
  })

  it('unknown target type returns false', () => {
    expect(isTypeCompatible(field('string'), field('unknown'))).toBe(false)
  })

  it('date → string returns false', () => {
    expect(isTypeCompatible(field('date'), field('string'))).toBe(false)
  })
})
