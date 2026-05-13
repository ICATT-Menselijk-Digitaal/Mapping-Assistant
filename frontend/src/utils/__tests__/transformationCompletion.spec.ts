import { describe, it, expect } from 'vitest'
import { getMismatchTypes, isMismatchResolved, isMappingComplete } from '../transformationCompletion'
import type { SchemaField } from '@/types'
import type { FieldMapping, TransformationRule } from '@/types/mapping'

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return { id: 'f', name: 'field', path: 'field', dataType: 'string', required: false, ...overrides }
}

function rule(overrides: Partial<TransformationRule>): TransformationRule {
  return { id: 'r', expression: '$', label: 'x', source: 'manual', ...overrides }
}

function mapping(transformations: TransformationRule[] = []): FieldMapping {
  return { id: '1', sourceFieldId: 'src', targetFieldId: 'tgt', transformations, status: 'confirmed' }
}

describe('getMismatchTypes', () => {
  it('returns empty list for compatible same-type fields', () => {
    expect(getMismatchTypes(field(), field())).toEqual([])
  })

  it('detects truncate when source maxLength exceeds target maxLength', () => {
    const src = field({ dataType: 'string', maxLength: 200 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(getMismatchTypes(src, tgt)).toContain('truncate')
  })

  it('detects truncate when target has maxLength and source has none', () => {
    const src = field({ dataType: 'string' })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(getMismatchTypes(src, tgt)).toContain('truncate')
  })

  it('does not detect truncate when source fits within target maxLength', () => {
    const src = field({ dataType: 'string', maxLength: 30 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(getMismatchTypes(src, tgt)).not.toContain('truncate')
  })

  it('detects default when source is optional and target is required', () => {
    const src = field({ required: false })
    const tgt = field({ required: true })
    expect(getMismatchTypes(src, tgt)).toContain('default')
  })

  it('does not detect default when both are required', () => {
    const src = field({ required: true })
    const tgt = field({ required: true })
    expect(getMismatchTypes(src, tgt)).not.toContain('default')
  })

  it('detects cast for number → string', () => {
    const src = field({ dataType: 'number' })
    const tgt = field({ dataType: 'string' })
    expect(getMismatchTypes(src, tgt)).toContain('cast')
  })

  it('does not include direct in the result', () => {
    expect(getMismatchTypes(field(), field())).not.toContain('direct')
  })

  it('detects date-format for date-to-date', () => {
    const src = field({ dataType: 'date' })
    const tgt = field({ dataType: 'date' })
    expect(getMismatchTypes(src, tgt)).toContain('date-format')
  })

  it('detects both truncate and default for optional long string → required short string', () => {
    const src = field({ dataType: 'string', maxLength: 100, required: false })
    const tgt = field({ dataType: 'string', maxLength: 50, required: true })
    const result = getMismatchTypes(src, tgt)
    expect(result).toContain('truncate')
    expect(result).toContain('default')
  })
})

describe('isMismatchResolved', () => {
  it('returns true when a rule resolves the mismatch with a non-empty expression', () => {
    const rules = [rule({ resolvesMismatch: 'truncate', expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $' })]
    expect(isMismatchResolved('truncate', rules)).toBe(true)
  })

  it('returns false when no rule claims the mismatch', () => {
    const rules = [rule({ resolvesMismatch: 'default', expression: '$ != null ? $ : "x"' })]
    expect(isMismatchResolved('truncate', rules)).toBe(false)
  })

  it('returns false when the matching rule has an empty expression', () => {
    const rules = [rule({ resolvesMismatch: 'truncate', expression: '' })]
    expect(isMismatchResolved('truncate', rules)).toBe(false)
  })

  it('returns false when the matching rule has a whitespace-only expression', () => {
    const rules = [rule({ resolvesMismatch: 'truncate', expression: '   ' })]
    expect(isMismatchResolved('truncate', rules)).toBe(false)
  })

  it('returns true when at least one of multiple rules resolves the mismatch', () => {
    const rules = [
      rule({ resolvesMismatch: 'default', expression: '$ != null ? $ : "x"' }),
      rule({ resolvesMismatch: 'truncate', expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $' }),
    ]
    expect(isMismatchResolved('truncate', rules)).toBe(true)
  })
})

describe('isMappingComplete', () => {
  it('returns true for compatible fields with no rules', () => {
    expect(isMappingComplete(mapping([]), field(), field())).toBe(true)
  })

  it('returns false when a mismatch has no resolving rule', () => {
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(isMappingComplete(mapping([]), src, tgt)).toBe(false)
  })

  it('returns true when all detected mismatches are resolved', () => {
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    const rules = [rule({ resolvesMismatch: 'truncate', expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $' })]
    expect(isMappingComplete(mapping(rules), src, tgt)).toBe(true)
  })

  it('returns false when at least one mismatch is unresolved', () => {
    const src = field({ dataType: 'string', maxLength: 100, required: false })
    const tgt = field({ dataType: 'string', maxLength: 50, required: true })
    const rules = [rule({ resolvesMismatch: 'truncate', expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $' })]
    // truncate is resolved but default is not
    expect(isMappingComplete(mapping(rules), src, tgt)).toBe(false)
  })
})
