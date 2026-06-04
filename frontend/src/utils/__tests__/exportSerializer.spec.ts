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

const aiRule: TransformationRule = {
  id: 'r2',
  expression: '$uppercase(name)',
  label: 'Uppercase name',
  source: 'ai',
  aiExplanation: 'Target expects upper case per schema description.',
}

const mappings: FieldMapping[] = [
  { id: 'm1', sourceFieldId: 'customerId', targetFieldId: 'id', transformations: [truncationRule, aiRule], status: 'confirmed' },
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

  it('exports transformation rules as a lean { expression, label, source } shape', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings).toHaveLength(2)
    expect(result.fieldMappings[0]!.transformations[0]).toEqual({
      expression: 'substring(0, 10)',
      label: 'Truncate',
      source: 'mismatch-solution',
    })
    expect(result.fieldMappings[1]).toEqual({
      sourceField: 'name',
      targetField: 'fullName',
      transformations: [],
    })
  })

  it('strips id, resolvesMismatch, and solutionParams from exported rules', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    const exportedRule = result.fieldMappings[0]!.transformations[0]!
    expect(exportedRule).not.toHaveProperty('id')
    expect(exportedRule).not.toHaveProperty('resolvesMismatch')
    expect(exportedRule).not.toHaveProperty('solutionParams')
  })

  it('includes aiExplanation only when the rule source is ai', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    const [exportedTruncation, exportedAi] = result.fieldMappings[0]!.transformations
    expect(exportedTruncation).not.toHaveProperty('aiExplanation')
    expect(exportedAi).toEqual({
      expression: '$uppercase(name)',
      label: 'Uppercase name',
      source: 'ai',
      aiExplanation: 'Target expects upper case per schema description.',
    })
  })

  it('does not include a status field on exported mappings', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    for (const m of result.fieldMappings) {
      expect(m).not.toHaveProperty('status')
    }
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

  it('does not include a derivable mappings stats block', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    expect(result.statistics).not.toHaveProperty('mappings')
  })

  it('produces an empty fieldMappings list when no mappings are provided', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: [],
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings).toHaveLength(0)
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

  // Scenario: Selected endpoints are preserved in the exported mapping set
  it('records the selected source endpoint path and method when provided', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null, selectedEndpoint: { path: '/customers', method: 'get' } },
      target: { schema: targetSchema, sourceUrl: null, selectedEndpoint: { path: '/users', method: 'post' } },
      mappings: [],
      aiStats: emptyAiStats,
    })
    expect(result.sourceSchema.selectedEndpoint).toEqual({ path: '/customers', method: 'get' })
    expect(result.targetSchema.selectedEndpoint).toEqual({ path: '/users', method: 'post' })
  })

  it('omits selectedEndpoint from the exported schema when none is provided', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: [],
      aiStats: emptyAiStats,
    })
    expect(result.sourceSchema).not.toHaveProperty('selectedEndpoint')
    expect(result.targetSchema).not.toHaveProperty('selectedEndpoint')
  })
})
