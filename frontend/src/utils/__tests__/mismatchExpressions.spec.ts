import { describe, it, expect } from 'vitest'
import {
  buildTruncationExpression,
  buildDefaultExpression,
  buildCastExpression,
  buildDateFormatExpression,
  buildSolutionLabel,
} from '../mismatchExpressions'

describe('buildTruncationExpression', () => {
  it('generates a clip-with-ellipsis expression for maxLength 50', () => {
    expect(buildTruncationExpression(50)).toBe(
      '$length($) > 50 ? $substring($, 0, 47) & "..." : $',
    )
  })

  it('generates correct expression for maxLength 10', () => {
    expect(buildTruncationExpression(10)).toBe(
      '$length($) > 10 ? $substring($, 0, 7) & "..." : $',
    )
  })
})

describe('buildDefaultExpression', () => {
  it('generates null-coalescing expression with the given value', () => {
    expect(buildDefaultExpression('onbekend')).toBe('$ != null ? $ : "onbekend"')
  })

  it('escapes double quotes in the default value', () => {
    const expr = buildDefaultExpression('say "hello"')
    expect(expr).toBe('$ != null ? $ : "say \\"hello\\""')
  })
})

describe('buildCastExpression', () => {
  it('generates $string($) for number → string', () => {
    expect(buildCastExpression('number', 'string')).toBe('$string($)')
  })

  it('throws for unsupported cast pairs', () => {
    expect(() => buildCastExpression('boolean', 'date')).toThrow()
  })
})

describe('buildDateFormatExpression', () => {
  it('generates a JSONata date conversion expression', () => {
    const expr = buildDateFormatExpression('YYYY-MM-DD', 'DD/MM/YYYY')
    expect(expr).toBeTruthy()
    expect(typeof expr).toBe('string')
    expect(expr.length).toBeGreaterThan(0)
  })
})

describe('buildSolutionLabel', () => {
  it('generates Dutch label for truncate', () => {
    expect(buildSolutionLabel({ type: 'truncate', maxLength: 50 })).toBe('Afkappen op 50 tekens')
  })

  it('generates Dutch label for default', () => {
    expect(buildSolutionLabel({ type: 'default', value: 'onbekend' })).toBe('Standaardwaarde: onbekend')
  })

  it('generates Dutch label for cast number → string', () => {
    expect(buildSolutionLabel({ type: 'cast', from: 'number', to: 'string' })).toBe('Getal naar tekst')
  })

  it('generates Dutch label for date-format', () => {
    expect(buildSolutionLabel({ type: 'date-format', sourceFormat: 'YYYY-MM-DD', targetFormat: 'DD/MM/YYYY' })).toBe(
      'Datumnotatie: YYYY-MM-DD → DD/MM/YYYY',
    )
  })
})
