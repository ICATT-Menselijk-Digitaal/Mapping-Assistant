import { describe, it, expect } from 'vitest'
import { deserializeMappingSet, ImportFormatError } from '../importDeserializer'

const minimalV11 = {
  version: '1.1',
  exportedAt: '2026-06-04T00:00:00.000Z',
  sourceSchema: { name: 'Source', sourceUrl: null, fields: [] },
  targetSchema: { name: 'Target', sourceUrl: null, fields: [] },
  fieldMappings: [],
  statistics: { ai: { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] } },
}

describe('deserializeMappingSet', () => {
  it('returns the typed payload with no warnings when shape is valid v1.1', () => {
    const result = deserializeMappingSet(minimalV11)
    expect(result.payload.version).toBe('1.1')
    expect(result.payload.sourceSchema.name).toBe('Source')
    expect(result.payload.fieldMappings).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('throws ImportFormatError when version is missing', () => {
    const { version: _v, ...rest } = minimalV11
    expect(() => deserializeMappingSet(rest)).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet(rest)).toThrow(/version/i)
  })

  it('emits a warning but still returns a payload on an unknown version', () => {
    const result = deserializeMappingSet({ ...minimalV11, version: '2.0' })
    expect(result.payload.sourceSchema.name).toBe('Source')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/version/i)
    expect(result.warnings[0]).toMatch(/2\.0/)
  })

  it('throws ImportFormatError when sourceSchema is missing', () => {
    const { sourceSchema: _s, ...rest } = minimalV11
    expect(() => deserializeMappingSet(rest)).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet(rest)).toThrow(/sourceSchema/)
  })

  it('throws ImportFormatError when fieldMappings is missing', () => {
    const { fieldMappings: _m, ...rest } = minimalV11
    expect(() => deserializeMappingSet(rest)).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet(rest)).toThrow(/fieldMappings/)
  })

  it('throws ImportFormatError when input is not an object', () => {
    expect(() => deserializeMappingSet('nope')).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet('nope')).toThrow(/not an object/i)
    expect(() => deserializeMappingSet(null)).toThrow(ImportFormatError)
  })
})
