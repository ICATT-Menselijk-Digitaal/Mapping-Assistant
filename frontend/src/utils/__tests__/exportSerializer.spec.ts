import { describe, it, expect } from 'vitest'
import { serializeMappingSet } from '../exportSerializer'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import type { FieldMapping, TransformationRule } from '@/types'

function node(overrides: Partial<SchemaFieldNode> & { name: string; id: string; path: string }): SchemaFieldNode {
  return { dataType: 'string', required: false, ...overrides }
}

const sourceSchema = buildSchema('Source', [
  node({ name: 'customerId', id: 'customerId', path: 'customerId' }),
  node({ name: 'name', id: 'name', path: 'name' }),
])

const targetSchema = buildSchema('Target', [
  node({ name: 'id', id: 'id', path: 'id' }),
  node({ name: 'fullName', id: 'fullName', path: 'fullName' }),
])

const truncationRule: TransformationRule = {
  id: 'r1',
  expression: 'substring(0, 10)',
  label: 'Truncate',
  source: 'mismatch-solution',
  resolvesMismatch: 'truncate',
  solutionParams: { type: 'truncate', maxLength: 10 },
}

const mappings: FieldMapping[] = [
  { id: 'm1', sourceFieldId: 'customerId', targetFieldId: 'id', transformations: [truncationRule], status: 'confirmed' },
  { id: 'm2', sourceFieldId: 'name', targetFieldId: 'fullName', transformations: [], status: 'rejected' },
]

const emptyAiStats = { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] }

describe('serializeMappingSet', () => {
  it('produces version 1.1 exports with an ISO timestamp', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: 'https://example.com/src.json' },
      target: { schema: targetSchema, sourceUrl: 'https://example.com/tgt.json' },
      mappings,
      aiStats: emptyAiStats,
    })
    expect(result.version).toBe('1.1')
    expect(result.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('serialises schemas as URL only (no fields key) when sourceUrl is present', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: 'https://example.com/src.json' },
      target: { schema: targetSchema, sourceUrl: 'https://example.com/tgt.json' },
      mappings: [],
      aiStats: emptyAiStats,
    })
    expect(result.sourceSchema).toEqual({ name: 'Source', sourceUrl: 'https://example.com/src.json' })
    expect(result.targetSchema).toEqual({ name: 'Target', sourceUrl: 'https://example.com/tgt.json' })
    expect('fields' in result.sourceSchema).toBe(false)
    expect('fields' in result.targetSchema).toBe(false)
  })

  it('falls back to parsed fields snapshot when a schema was loaded from file (no URL)', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: 'https://example.com/tgt.json' },
      mappings: [],
      aiStats: emptyAiStats,
    })
    expect(result.sourceSchema.sourceUrl).toBeNull()
    expect(result.sourceSchema.fields).toHaveLength(2)
    expect('fields' in result.targetSchema).toBe(false)
  })

  it('includes per-mapping transformations (without internal id) and status', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings).toHaveLength(2)
    const { id: _id, ...ruleWithoutId } = truncationRule
    expect(result.fieldMappings[0]).toMatchObject({
      sourceField: 'customerId',
      targetField: 'id',
      status: 'confirmed',
      transformations: [ruleWithoutId],
    })
    expect(result.fieldMappings[0]!.transformations[0]).not.toHaveProperty('id')
    expect(result.fieldMappings[1]).toMatchObject({
      status: 'rejected',
      transformations: [],
    })
  })

  it('includes AI suggestion statistics verbatim', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: [],
      aiStats: { totalGenerated: 7, accepted: 3, rejected: 2, rejectedPairs: ['a::b', 'c::d'] },
    })
    expect(result.statistics.ai).toEqual({
      totalGenerated: 7,
      accepted: 3,
      rejected: 2,
      rejectedPairs: ['a::b', 'c::d'],
    })
  })

  it('computes mapping statistics from the provided mappings', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    expect(result.statistics.mappings).toEqual({
      total: 2,
      confirmed: 1,
      rejected: 1,
      withTransformations: 1,
    })
  })

  it('produces an empty fieldMappings list and zero mapping stats when no mappings are provided', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: [],
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings).toHaveLength(0)
    expect(result.statistics.mappings).toEqual({ total: 0, confirmed: 0, rejected: 0, withTransformations: 0 })
  })

  it('uses the provided exportedAt when supplied (deterministic for tests)', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: [],
      aiStats: emptyAiStats,
      exportedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(result.exportedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})
