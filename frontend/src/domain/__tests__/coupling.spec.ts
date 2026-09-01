import { describe, it, expect } from 'vitest'
import { analyze, isMismatchResolved, isResolved } from '../coupling'
import type { SchemaField } from '@/types'
import type { FieldMapping, MismatchType, TransformationRule } from '@/types/mapping'

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

function rule(overrides: Partial<TransformationRule>): TransformationRule {
  return { id: 'r', expression: '$', label: 'x', source: 'manual', ...overrides }
}

function mapping(transformations: TransformationRule[] = []): FieldMapping {
  return {
    id: '1',
    sourceFieldId: 'src',
    targetFieldId: 'tgt',
    transformations,
    status: 'confirmed',
  }
}

describe('analyze — status', () => {
  it('returns compatible for same-type fields with no constraint mismatch', () => {
    expect(analyze(field({ dataType: 'string' }), field({ dataType: 'string' })).status).toBe(
      'compatible',
    )
  })

  it('returns compatible for a castable pair (number → string)', () => {
    expect(analyze(field({ dataType: 'number' }), field({ dataType: 'string' })).status).toBe(
      'compatible',
    )
  })

  it('returns constrained when source maxLength exceeds target maxLength', () => {
    const result = analyze(
      field({ dataType: 'string', maxLength: 100 }),
      field({ dataType: 'string', maxLength: 50 }),
    )
    expect(result.status).toBe('constrained')
  })

  it('returns compatible when target maxLength is undefined', () => {
    const result = analyze(
      field({ dataType: 'string', maxLength: 100 }),
      field({ dataType: 'string' }),
    )
    expect(result.status).toBe('compatible')
  })

  it('returns constrained when source type is unknown', () => {
    expect(analyze(field({ dataType: 'unknown' }), field({ dataType: 'string' })).status).toBe(
      'constrained',
    )
  })

  it('returns constrained when target type is unknown', () => {
    expect(analyze(field({ dataType: 'string' }), field({ dataType: 'unknown' })).status).toBe(
      'constrained',
    )
  })

  it('returns incompatible for object → string', () => {
    expect(analyze(field({ dataType: 'object' }), field({ dataType: 'string' })).status).toBe(
      'incompatible',
    )
  })

  it('returns incompatible for array → number', () => {
    expect(analyze(field({ dataType: 'array' }), field({ dataType: 'number' })).status).toBe(
      'incompatible',
    )
  })

  it('returns incompatible for boolean → date', () => {
    expect(analyze(field({ dataType: 'boolean' }), field({ dataType: 'date' })).status).toBe(
      'incompatible',
    )
  })

  // Behaviour change from the old validationStatus / transformationCompletion
  // split: date → date used to report status='compatible' AND a 'date-format'
  // mismatch — a contradiction. It now correctly reports 'constrained'
  // because there's an unresolved mismatch.
  it('returns constrained for date → date (a date-format rule is required)', () => {
    expect(analyze(field({ dataType: 'date' }), field({ dataType: 'date' })).status).toBe(
      'constrained',
    )
  })
})

describe('analyze — mismatches', () => {
  it('returns no mismatches for compatible same-type fields', () => {
    expect(analyze(field(), field()).mismatches).toEqual([])
  })

  it('detects truncate when source maxLength exceeds target maxLength', () => {
    const src = field({ dataType: 'string', maxLength: 200 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(analyze(src, tgt).mismatches).toContain('truncate')
  })

  it('detects truncate when target has maxLength and source has none', () => {
    const src = field({ dataType: 'string' })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(analyze(src, tgt).mismatches).toContain('truncate')
  })

  it('does not detect truncate when source fits within target maxLength', () => {
    const src = field({ dataType: 'string', maxLength: 30 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(analyze(src, tgt).mismatches).not.toContain('truncate')
  })

  it('detects default when source is optional and target is required', () => {
    const src = field({ required: false })
    const tgt = field({ required: true })
    expect(analyze(src, tgt).mismatches).toContain('default')
  })

  it('does not detect default when both are required', () => {
    const src = field({ required: true })
    const tgt = field({ required: true })
    expect(analyze(src, tgt).mismatches).not.toContain('default')
  })

  it('does not detect cast for a castable pair (number → string is silent)', () => {
    const src = field({ dataType: 'number' })
    const tgt = field({ dataType: 'string' })
    expect(analyze(src, tgt).mismatches).not.toContain('cast')
  })

  it('detects date-format for date → date', () => {
    const src = field({ dataType: 'date' })
    const tgt = field({ dataType: 'date' })
    expect(analyze(src, tgt).mismatches).toContain('date-format')
  })

  it('returns no mismatches for an incompatible pair', () => {
    // Nothing the administrator can add resolves a fundamental type clash —
    // status='incompatible' carries the outcome, mismatches stays empty.
    expect(analyze(field({ dataType: 'object' }), field({ dataType: 'string' })).mismatches).toEqual(
      [],
    )
  })

  it('detects both truncate and default for optional long string → required short string', () => {
    const src = field({ dataType: 'string', maxLength: 100, required: false })
    const tgt = field({ dataType: 'string', maxLength: 50, required: true })
    const result = analyze(src, tgt).mismatches
    expect(result).toContain('truncate')
    expect(result).toContain('default')
  })
})

describe('isMismatchResolved', () => {
  it('returns true when a rule resolves the mismatch with a non-empty expression', () => {
    const rules = [
      rule({
        resolvesMismatch: 'truncate',
        expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $',
      }),
    ]
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
      rule({
        resolvesMismatch: 'truncate',
        expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $',
      }),
    ]
    expect(isMismatchResolved('truncate', rules)).toBe(true)
  })

  it('returns true when type is in manuallyResolved', () => {
    expect(isMismatchResolved('truncate', [], ['truncate'])).toBe(true)
  })

  it('returns false when type is not in manuallyResolved', () => {
    expect(isMismatchResolved('truncate', [], ['default'])).toBe(false)
  })

  it('returns true when resolved by rule even with empty manuallyResolved', () => {
    const rules = [rule({ resolvesMismatch: 'truncate', expression: '$substring($, 0, 47)' })]
    expect(isMismatchResolved('truncate', rules, [])).toBe(true)
  })
})

describe('isResolved', () => {
  it('returns true for compatible fields with no rules', () => {
    const analysis = analyze(field(), field())
    expect(isResolved(analysis, mapping([]))).toBe(true)
  })

  it('returns false when a mismatch has no resolving rule', () => {
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(isResolved(analyze(src, tgt), mapping([]))).toBe(false)
  })

  it('returns true when all detected mismatches are resolved', () => {
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    const rules = [
      rule({
        resolvesMismatch: 'truncate',
        expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $',
      }),
    ]
    expect(isResolved(analyze(src, tgt), mapping(rules))).toBe(true)
  })

  it('returns false when at least one mismatch is unresolved', () => {
    const src = field({ dataType: 'string', maxLength: 100, required: false })
    const tgt = field({ dataType: 'string', maxLength: 50, required: true })
    const rules = [
      rule({
        resolvesMismatch: 'truncate',
        expression: '$length($) > 50 ? $substring($, 0, 47) & "..." : $',
      }),
    ]
    expect(isResolved(analyze(src, tgt), mapping(rules))).toBe(false)
  })

  it('returns true when all mismatches are manually resolved', () => {
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    const m = { ...mapping([]), manuallyResolvedMismatches: ['truncate' as MismatchType] }
    expect(isResolved(analyze(src, tgt), m)).toBe(true)
  })

  it('returns false when only some mismatches are manually resolved', () => {
    const src = field({ dataType: 'string', maxLength: 100, required: false })
    const tgt = field({ dataType: 'string', maxLength: 50, required: true })
    const m = { ...mapping([]), manuallyResolvedMismatches: ['truncate' as MismatchType] }
    expect(isResolved(analyze(src, tgt), m)).toBe(false)
  })

  it('returns false for an incompatible pair regardless of rules', () => {
    // Old isMappingComplete returned true here (mismatches was empty and
    // .every returns true); the UI hid the bug by keying off validationStatus
    // instead of isComplete. The new isResolved is honest.
    const src = field({ dataType: 'object' })
    const tgt = field({ dataType: 'string' })
    expect(isResolved(analyze(src, tgt), mapping([]))).toBe(false)
  })
})
