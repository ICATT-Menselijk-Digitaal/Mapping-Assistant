import { describe, it, expect } from 'vitest'
import { isRuleComplete, getRequiredRuleTypes, isMappingComplete } from '../transformationCompletion'
import type { SchemaField } from '@/types'
import type { FieldMapping } from '@/types/mapping'

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    id: 'f',
    name: 'field',
    path: 'field',
    dataType: 'string',
    required: false,
    ...overrides,
  }
}

describe('isRuleComplete', () => {
  it('direct is always complete', () => {
    expect(isRuleComplete({ type: 'direct' })).toBe(true)
  })

  it('truncate stub (no value) is incomplete', () => {
    expect(isRuleComplete({ type: 'truncate' })).toBe(false)
  })

  it('truncate with value >= 4 is complete', () => {
    expect(isRuleComplete({ type: 'truncate', truncationMaxLength: 40 })).toBe(true)
  })

  it('truncate with value below 4 is incomplete', () => {
    expect(isRuleComplete({ type: 'truncate', truncationMaxLength: 3 })).toBe(false)
  })

  it('default stub (no value) is incomplete', () => {
    expect(isRuleComplete({ type: 'default' })).toBe(false)
  })

  it('default with value is complete', () => {
    expect(isRuleComplete({ type: 'default', defaultValue: 'onbekend' })).toBe(true)
  })

  it('default with empty string is incomplete', () => {
    expect(isRuleComplete({ type: 'default', defaultValue: '' })).toBe(false)
  })

  it('default with whitespace-only string is incomplete', () => {
    expect(isRuleComplete({ type: 'default', defaultValue: '   ' })).toBe(false)
  })

  it('cast stub (no values) is incomplete', () => {
    expect(isRuleComplete({ type: 'cast' })).toBe(false)
  })

  it('cast with both from and to is complete', () => {
    expect(isRuleComplete({ type: 'cast', castFrom: 'number', castTo: 'string' })).toBe(true)
  })

  it('cast with only castFrom is incomplete', () => {
    expect(isRuleComplete({ type: 'cast', castFrom: 'number' })).toBe(false)
  })

  it('date-format stub (no values) is incomplete', () => {
    expect(isRuleComplete({ type: 'date-format' })).toBe(false)
  })

  it('date-format with both formats is complete', () => {
    expect(isRuleComplete({ type: 'date-format', sourceDateFormat: 'dd-MM-yyyy', targetDateFormat: 'yyyy-MM-dd' })).toBe(true)
  })

  it('date-format with empty source format is incomplete', () => {
    expect(isRuleComplete({ type: 'date-format', sourceDateFormat: '', targetDateFormat: 'yyyy-MM-dd' })).toBe(false)
  })

  it('static stub is incomplete', () => {
    expect(isRuleComplete({ type: 'static' })).toBe(false)
  })

  it('static with value is complete', () => {
    expect(isRuleComplete({ type: 'static', staticValue: 'NL' })).toBe(true)
  })

  it('expression stub is incomplete', () => {
    expect(isRuleComplete({ type: 'expression' })).toBe(false)
  })

  it('expression with value is complete', () => {
    expect(isRuleComplete({ type: 'expression', expression: '$string(value)' })).toBe(true)
  })
})

describe('getRequiredRuleTypes', () => {
  it('always includes direct', () => {
    const result = getRequiredRuleTypes(field(), field())
    expect(result).toContain('direct')
  })

  it('no extra rules for compatible same-type fields', () => {
    expect(getRequiredRuleTypes(field(), field())).toEqual(['direct'])
  })

  it('adds truncate when target has maxLength (no source maxLength)', () => {
    const src = field({ dataType: 'string' })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(getRequiredRuleTypes(src, tgt)).toContain('truncate')
  })

  it('adds truncate when source maxLength exceeds target maxLength', () => {
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(getRequiredRuleTypes(src, tgt)).toContain('truncate')
  })

  it('does not add truncate when source fits within target maxLength', () => {
    const src = field({ dataType: 'string', maxLength: 30 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(getRequiredRuleTypes(src, tgt)).not.toContain('truncate')
  })

  it('adds default when source is optional and target is required', () => {
    const src = field({ required: false })
    const tgt = field({ required: true })
    expect(getRequiredRuleTypes(src, tgt)).toContain('default')
  })

  it('does not add default when both are required', () => {
    const src = field({ required: true })
    const tgt = field({ required: true })
    expect(getRequiredRuleTypes(src, tgt)).not.toContain('default')
  })

  it('adds cast for different-type convertible fields (number → string)', () => {
    const src = field({ dataType: 'number' })
    const tgt = field({ dataType: 'string' })
    expect(getRequiredRuleTypes(src, tgt)).toContain('cast')
  })

  it('does not add cast for same-type fields', () => {
    expect(getRequiredRuleTypes(field({ dataType: 'string' }), field({ dataType: 'string' }))).not.toContain('cast')
  })

  it('does not add cast for incompatible fields (object → string)', () => {
    const src = field({ dataType: 'object' })
    const tgt = field({ dataType: 'string' })
    expect(getRequiredRuleTypes(src, tgt)).not.toContain('cast')
  })

  it('adds date-format for date-to-date', () => {
    const src = field({ dataType: 'date' })
    const tgt = field({ dataType: 'date' })
    expect(getRequiredRuleTypes(src, tgt)).toContain('date-format')
  })

  it('does not add date-format for non-date fields', () => {
    expect(getRequiredRuleTypes(field(), field())).not.toContain('date-format')
  })

  it('adds both default and date-format for optional date → required date', () => {
    const src = field({ dataType: 'date', required: false })
    const tgt = field({ dataType: 'date', required: true })
    const result = getRequiredRuleTypes(src, tgt)
    expect(result).toContain('default')
    expect(result).toContain('date-format')
  })

  it('adds both truncate and default for optional long string → required short string', () => {
    const src = field({ dataType: 'string', maxLength: 100, required: false })
    const tgt = field({ dataType: 'string', maxLength: 50, required: true })
    const result = getRequiredRuleTypes(src, tgt)
    expect(result).toContain('truncate')
    expect(result).toContain('default')
  })
})

describe('isMappingComplete', () => {
  it('direct-only mapping for compatible fields is complete', () => {
    const mapping: FieldMapping = {
      id: '1', sourceFieldId: 'src', targetFieldId: 'tgt',
      transformations: [{ type: 'direct' }], status: 'confirmed',
    }
    expect(isMappingComplete(mapping, field(), field())).toBe(true)
  })

  it('mapping with truncate stub for constrained string pair is incomplete', () => {
    const mapping: FieldMapping = {
      id: '1', sourceFieldId: 'src', targetFieldId: 'tgt',
      transformations: [{ type: 'direct' }, { type: 'truncate' }], status: 'confirmed',
    }
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(isMappingComplete(mapping, src, tgt)).toBe(false)
  })

  it('mapping with complete truncate rule is complete', () => {
    const mapping: FieldMapping = {
      id: '1', sourceFieldId: 'src', targetFieldId: 'tgt',
      transformations: [{ type: 'direct' }, { type: 'truncate', truncationMaxLength: 40 }], status: 'confirmed',
    }
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(isMappingComplete(mapping, src, tgt)).toBe(true)
  })

  it('mapping missing a required rule is incomplete', () => {
    const mapping: FieldMapping = {
      id: '1', sourceFieldId: 'src', targetFieldId: 'tgt',
      transformations: [{ type: 'direct' }], status: 'confirmed',
    }
    const src = field({ dataType: 'string', maxLength: 100 })
    const tgt = field({ dataType: 'string', maxLength: 50 })
    expect(isMappingComplete(mapping, src, tgt)).toBe(false)
  })
})
