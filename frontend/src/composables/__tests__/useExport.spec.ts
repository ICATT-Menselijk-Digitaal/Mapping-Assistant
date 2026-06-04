import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useExport } from '../useExport'
import { useMappings } from '../useMappings'
import { useAISuggestions } from '../useAISuggestions'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

function node(overrides: Partial<SchemaFieldNode> & { name: string; id: string; path: string }): SchemaFieldNode {
  return { dataType: 'string', required: false, ...overrides }
}

const sourceSchema = buildSchema('Source', [
  node({ name: 'customerId', id: 'customerId', path: 'customerId' }),
])

const targetSchema = buildSchema('Target', [
  node({ name: 'id', id: 'id', path: 'id' }),
])

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useExport', () => {
  it('returns a v1.1 export with schemas, mappings, and statistics block', () => {
    const mappings = useMappings()
    mappings.createMapping({ sourceFieldId: 'customerId', targetFieldId: 'id' })

    const exporter = useExport()
    const result = exporter.exportMappingSet(
      { schema: sourceSchema, sourceUrl: 'https://src' },
      { schema: targetSchema, sourceUrl: 'https://tgt' },
    )

    expect(result.version).toBe('1.1')
    expect(result.sourceSchema).toEqual({ name: 'Source', sourceUrl: 'https://src' })
    expect(result.targetSchema).toEqual({ name: 'Target', sourceUrl: 'https://tgt' })
    expect(result.fieldMappings).toHaveLength(1)
    expect(result.fieldMappings[0]).toMatchObject({ sourceField: 'customerId', targetField: 'id' })
    expect(result.fieldMappings[0]).not.toHaveProperty('status')
    expect(result.statistics.ai.totalGenerated).toBe(0)
  })

  it('reads AI statistics from the useAISuggestions store', () => {
    const ai = useAISuggestions()
    ai.totalGenerated = 5
    ai.accepted = 2
    ai.rejected = 1
    ai.rejectedPairs.add('src-1::tgt-1')

    const exporter = useExport()
    const result = exporter.exportMappingSet(
      { schema: sourceSchema, sourceUrl: null },
      { schema: targetSchema, sourceUrl: null },
    )

    expect(result.statistics.ai).toEqual({
      totalGenerated: 5,
      accepted: 2,
      rejected: 1,
      rejectedPairs: ['src-1::tgt-1'],
    })
  })

  it('emits a MappingSetExported event with the correct type and timestamp', () => {
    const exporter = useExport()
    exporter.exportMappingSet(
      { schema: sourceSchema, sourceUrl: null },
      { schema: targetSchema, sourceUrl: null },
    )

    const event = exporter.lastEvent.value
    expect(event).not.toBeNull()
    expect(event?.type).toBe('MappingSetExported')
    expect(event?.timestamp).toBeTruthy()
    expect(event?.payload.version).toBe('1.1')
  })

  it('produces an export with empty fieldMappings when no mappings exist', () => {
    const exporter = useExport()
    const result = exporter.exportMappingSet(
      { schema: sourceSchema, sourceUrl: null },
      { schema: targetSchema, sourceUrl: null },
    )

    expect(result.fieldMappings).toHaveLength(0)
  })
})
