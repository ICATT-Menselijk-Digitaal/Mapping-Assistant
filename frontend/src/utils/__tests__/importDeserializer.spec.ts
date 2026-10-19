import { describe, it, expect } from 'vitest'
import { deserializeMappingSet, ImportFormatError } from '../importDeserializer'

const minimal = {
  metadata: { exportVersion: 7, exportedAt: '2026-10-14T09:32:00.000Z' },
  sourceSchema: { name: 'Source', sourceUrl: null, fields: [] },
  targetSchema: { name: 'Target', sourceUrl: null, fields: [] },
  fieldMappings: [],
  statistics: { ai: { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] } },
}

// Export format from before Feature #198: a top-level format version and
// timestamp, no metadata block.
const { metadata: _m, ...withoutMetadata } = minimal
const legacyV11 = { version: '1.1', exportedAt: '2026-06-04T00:00:00.000Z', ...withoutMetadata }

describe('deserializeMappingSet', () => {
  it('returns the typed payload with no warnings when the shape is valid', () => {
    const result = deserializeMappingSet(minimal)
    expect(result.payload.sourceSchema.name).toBe('Source')
    expect(result.payload.fieldMappings).toEqual([])
    expect(result.warnings).toEqual([])
  })

  // Scenario: Re-importing an exported file preserves its export version
  it('reads the export version and timestamp from the metadata block', () => {
    const result = deserializeMappingSet(minimal)
    expect(result.exportMeta).toEqual({
      exportVersion: 7,
      exportedAt: '2026-10-14T09:32:00.000Z',
    })
  })

  // Scenario: Importing an older export without an export version starts the count again
  it('treats an older export without metadata as export version 0, without warnings', () => {
    const result = deserializeMappingSet(legacyV11)
    expect(result.payload.sourceSchema.name).toBe('Source')
    expect(result.exportMeta).toEqual({ exportVersion: 0, exportedAt: null })
    expect(result.warnings).toEqual([])
  })

  // Scenario: Importing a file with an unreadable export version
  it.each([['drie'], [-1], [2.5], [null]])(
    'imports with a warning and export version 0 when exportVersion is %j',
    (exportVersion) => {
      const result = deserializeMappingSet({
        ...minimal,
        metadata: { ...minimal.metadata, exportVersion },
      })
      expect(result.payload.sourceSchema.name).toBe('Source')
      expect(result.exportMeta).toEqual({ exportVersion: 0, exportedAt: null })
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toMatch(/exportversie/i)
    },
  )

  it('no longer requires a top-level version field', () => {
    expect(() => deserializeMappingSet(withoutMetadata)).not.toThrow()
  })

  it('throws ImportFormatError when sourceSchema is missing', () => {
    const { sourceSchema: _s, ...rest } = minimal
    expect(() => deserializeMappingSet(rest)).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet(rest)).toThrow(/sourceSchema/)
  })

  it('throws ImportFormatError when fieldMappings is missing', () => {
    const { fieldMappings: _f, ...rest } = minimal
    expect(() => deserializeMappingSet(rest)).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet(rest)).toThrow(/fieldMappings/)
  })

  it('throws ImportFormatError when input is not an object', () => {
    expect(() => deserializeMappingSet('nope')).toThrow(ImportFormatError)
    expect(() => deserializeMappingSet('nope')).toThrow(/not an object/i)
    expect(() => deserializeMappingSet(null)).toThrow(ImportFormatError)
  })
})
