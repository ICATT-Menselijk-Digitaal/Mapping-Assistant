import { describe, it, expect } from 'vitest'
import { serializeMappingSet } from '../exportSerializer'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import type { FieldMapping, TransformationRule } from '@/types'

function node(
  overrides: Partial<SchemaFieldNode> & { name: string; id: string; path: string },
): SchemaFieldNode {
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
  {
    id: 'm1',
    sourceFieldId: 'customerId',
    targetFieldId: 'id',
    transformations: [truncationRule, aiRule],
    status: 'confirmed',
  },
  {
    id: 'm2',
    sourceFieldId: 'name',
    targetFieldId: 'fullName',
    transformations: [],
    status: 'rejected',
  },
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
    expect(result.sourceSchema).toEqual({
      name: 'Source',
      sourceUrl: 'https://example.com/src.json',
    })
    expect(result.targetSchema).toEqual({
      name: 'Target',
      sourceUrl: 'https://example.com/tgt.json',
    })
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

  it('exports mismatch-solution rules with the resolvesMismatch type preserved', () => {
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
      resolvesMismatch: 'truncate',
    })
    expect(result.fieldMappings[1]).toEqual({
      sourceField: 'name',
      targetField: 'fullName',
      transformations: [],
    })
  })

  it('strips id and solutionParams from exported rules', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    const exportedRule = result.fieldMappings[0]!.transformations[0]!
    expect(exportedRule).not.toHaveProperty('id')
    expect(exportedRule).not.toHaveProperty('solutionParams')
  })

  it('omits resolvesMismatch on rules that do not resolve a mismatch', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    const aiExported = result.fieldMappings[0]!.transformations[1]!
    expect(aiExported).not.toHaveProperty('resolvesMismatch')
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

  // Scenario: A comment survives export and import
  it('includes comment and commentedAt when present', () => {
    const withComment: FieldMapping[] = [
      {
        id: 'm3',
        sourceFieldId: 'customerId',
        targetFieldId: 'id',
        transformations: [],
        status: 'confirmed',
        comment: 'Belangrijke context',
        commentedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: withComment,
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings[0]!.comment).toBe('Belangrijke context')
    expect(result.fieldMappings[0]!.commentedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('omits comment and commentedAt when absent', () => {
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings,
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings[0]).not.toHaveProperty('comment')
    expect(result.fieldMappings[0]).not.toHaveProperty('commentedAt')
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

  // Feature #163: source-less ("default-value") coupling export. Its default
  // value is a transformation rule, like any other mismatch solution — no
  // separate field to export.
  it('exports a source-less coupling with sourceField null, carrying its default-value rule', () => {
    const sourceless: FieldMapping = {
      id: 'm3',
      sourceFieldId: null,
      targetFieldId: 'fullName',
      transformations: [
        {
          id: 'r3',
          expression: '"onbekend"',
          label: 'Standaardwaarde: onbekend',
          source: 'mismatch-solution',
          resolvesMismatch: 'missing-source',
        },
      ],
      status: 'confirmed',
    }
    const result = serializeMappingSet({
      source: { schema: sourceSchema, sourceUrl: null },
      target: { schema: targetSchema, sourceUrl: null },
      mappings: [sourceless],
      aiStats: emptyAiStats,
    })
    expect(result.fieldMappings[0]!.sourceField).toBeNull()
    expect(result.fieldMappings[0]!.targetField).toBe('fullName')
    expect(result.fieldMappings[0]!.transformations[0]!.resolvesMismatch).toBe('missing-source')
  })
})
