import { describe, it, expect } from 'vitest'
import { deserializeMappingSet } from '../importDeserializer'

const minimalV11 = {
  version: '1.1',
  exportedAt: '2026-06-04T00:00:00.000Z',
  sourceSchema: { name: 'Source', sourceUrl: null, fields: [] },
  targetSchema: { name: 'Target', sourceUrl: null, fields: [] },
  fieldMappings: [],
  statistics: { ai: { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] } },
}

describe('deserializeMappingSet', () => {
  it('returns the typed payload when shape is valid v1.1', () => {
    const result = deserializeMappingSet(minimalV11)
    expect(result.version).toBe('1.1')
    expect(result.sourceSchema.name).toBe('Source')
    expect(result.fieldMappings).toEqual([])
  })

  it('throws when version is missing', () => {
    const { version: _v, ...rest } = minimalV11
    expect(() => deserializeMappingSet(rest)).toThrow(/version/i)
  })

  it('throws on unsupported version', () => {
    expect(() => deserializeMappingSet({ ...minimalV11, version: '1.0' })).toThrow(/version/i)
  })

  it('throws when sourceSchema is missing', () => {
    const { sourceSchema: _s, ...rest } = minimalV11
    expect(() => deserializeMappingSet(rest)).toThrow(/sourceSchema/)
  })

  it('throws when fieldMappings is missing', () => {
    const { fieldMappings: _m, ...rest } = minimalV11
    expect(() => deserializeMappingSet(rest)).toThrow(/fieldMappings/)
  })

  it('throws when input is not an object', () => {
    expect(() => deserializeMappingSet('nope')).toThrow(/not an object/i)
    expect(() => deserializeMappingSet(null)).toThrow(/not an object/i)
  })
})
