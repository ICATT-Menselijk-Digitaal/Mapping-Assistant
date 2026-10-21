import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { queryClient } from '@/api/queryClient'
import { exportMetaResource, loadAll } from '@/api/resources'
import { useExport } from '../useExport'
import { useMappings } from '../useMappings'
import { useAISuggestions } from '../useAISuggestions'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

function node(
  overrides: Partial<SchemaFieldNode> & { name: string; id: string; path: string },
): SchemaFieldNode {
  return { dataType: 'string', required: false, ...overrides }
}

const sourceSchema = buildSchema('Source', [
  node({ name: 'customerId', id: 'customerId', path: 'customerId' }),
])

const targetSchema = buildSchema('Target', [node({ name: 'id', id: 'id', path: 'id' })])

// Let the fire-and-forget persist settle.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useExport', () => {
  it('returns an export with metadata, schemas, mappings, and statistics block', () => {
    const mappings = useMappings()
    mappings.createMapping({ sourceFieldId: 'customerId', targetFieldId: 'id' })

    const exporter = useExport()
    const result = exporter.exportMappingSet(
      { schema: sourceSchema, sourceUrl: 'https://src' },
      { schema: targetSchema, sourceUrl: 'https://tgt' },
    )

    expect(result.metadata.exportVersion).toBe(1)
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
    expect(event?.payload.metadata.exportVersion).toBe(1)
  })

  describe('export version', () => {
    const exportOnce = (exporter = useExport()) =>
      exporter.exportMappingSet(
        { schema: sourceSchema, sourceUrl: null },
        { schema: targetSchema, sourceUrl: null },
      )

    // Scenario: First export of a fresh coupling set is export version 1
    it('starts at export version 1 for a coupling set that was never exported', () => {
      expect(exportOnce().metadata.exportVersion).toBe(1)
    })

    // Scenario: Every subsequent export increments the export version
    it('increments the export version on every export', () => {
      exportOnce()
      exportOnce()
      expect(exportOnce().metadata.exportVersion).toBe(3)
    })

    it('shares the count across separate useExport() calls', () => {
      exportOnce(useExport())
      expect(exportOnce(useExport()).metadata.exportVersion).toBe(2)
    })

    it('remembers the latest export version and timestamp', () => {
      const result = exportOnce()
      expect(exportMetaResource.current()).toEqual({
        exportVersion: 1,
        exportedAt: result.metadata.exportedAt,
      })
    })

    // Scenario: The export version count survives a page reload
    it('continues the count after a page reload', async () => {
      exportOnce()
      exportOnce()
      await flush() // let the background persist settle

      queryClient.clear() // a reload starts from an empty cache…
      expect(exportMetaResource.current().exportVersion).toBe(0)
      await loadAll() // …and hydrates every resource from storage, like app start

      expect(exportOnce().metadata.exportVersion).toBe(3)
    })

    // Scenario: Two exports in quick succession each get their own version and timestamp
    it('gives two exports in quick succession their own version and timestamp', () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date('2026-10-14T09:32:00.000Z'))
        const first = exportOnce()
        vi.setSystemTime(new Date('2026-10-14T09:32:01.000Z'))
        const second = exportOnce()

        expect(first.metadata.exportVersion).toBe(1)
        expect(second.metadata.exportVersion).toBe(2)
        expect(first.metadata.exportedAt).toBe('2026-10-14 11:32:00')
        expect(second.metadata.exportedAt).toBe('2026-10-14 11:32:01')
      } finally {
        vi.useRealTimers()
      }
    })
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
