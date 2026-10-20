import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { exportMetaResource } from '@/api/resources'
import { useExport } from '../useExport'
import { useImport } from '../useImport'
import { useMappings } from '../useMappings'
import { useAISuggestions } from '../useAISuggestions'
import { useSchemaSide } from '../useSchemaSide'
import type { MappingSetExport } from '@/utils/exportSerializer'

const exportPayload: MappingSetExport = {
  metadata: { exportVersion: 7, exportedAt: '2026-06-04T00:00:00.000Z' },
  sourceSchema: {
    name: 'Source',
    sourceUrl: null,
    fields: [
      {
        id: 'customerId',
        name: 'customerId',
        path: 'customerId',
        dataType: 'string',
        required: true,
      },
      { id: 'address', name: 'address', path: 'address', dataType: 'object', required: false },
      {
        id: 'address.city',
        name: 'city',
        path: 'address.city',
        dataType: 'string',
        required: false,
      },
    ],
  },
  targetSchema: {
    name: 'Target',
    sourceUrl: null,
    fields: [
      { id: 'id', name: 'id', path: 'id', dataType: 'string', required: true },
      { id: 'city', name: 'city', path: 'city', dataType: 'string', required: false },
    ],
  },
  fieldMappings: [
    {
      sourceField: 'customerId',
      targetField: 'id',
      transformations: [
        { expression: 'substring(0, 10)', label: 'Truncate', source: 'mismatch-solution' },
      ],
    },
    { sourceField: 'address.city', targetField: 'city', transformations: [] },
  ],
  statistics: { ai: { totalGenerated: 0, accepted: 0, rejected: 0, rejectedPairs: [] } },
}

function jsonFile(payload: unknown): File {
  return new File([JSON.stringify(payload)], 'export.json', { type: 'application/json' })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useImport', () => {
  it('restores source schema, target schema, and field mappings from a valid file', async () => {
    const src = useSchemaSide('source')
    const tgt = useSchemaSide('target')
    const mappings = useMappings()
    const importer = useImport()

    await importer.importMappingSet(jsonFile(exportPayload), src, tgt)

    expect(src.schema.value.name).toBe('Source')
    expect(src.schema.value.all().map((f) => f.id)).toEqual([
      'customerId',
      'address',
      'address.city',
    ])
    expect(tgt.schema.value.name).toBe('Target')
    expect(tgt.schema.value.all().map((f) => f.id)).toEqual(['id', 'city'])

    expect(mappings.mappings).toHaveLength(2)
    expect(mappings.mappings[0]).toMatchObject({
      sourceFieldId: 'customerId',
      targetFieldId: 'id',
      status: 'confirmed',
    })
    expect(mappings.mappings[0]!.transformations).toHaveLength(1)
    expect(mappings.mappings[0]!.transformations[0]).toMatchObject({
      expression: 'substring(0, 10)',
      label: 'Truncate',
      source: 'mismatch-solution',
    })
    expect(mappings.mappings[0]!.transformations[0]!.id).toBeTruthy()
    expect(mappings.mappings[1]!.sourceFieldId).toBe('address.city')
  })

  it('emits a MappingSetImported event with the restored payload', async () => {
    const src = useSchemaSide('source')
    const tgt = useSchemaSide('target')
    const importer = useImport()

    await importer.importMappingSet(jsonFile(exportPayload), src, tgt)

    expect(importer.lastEvent.value).not.toBeNull()
    expect(importer.lastEvent.value?.type).toBe('MappingSetImported')
    expect(importer.lastEvent.value?.timestamp).toBeTruthy()
    expect(importer.lastEvent.value?.payload.metadata.exportVersion).toBe(7)
  })

  it('preserves resolvesMismatch on transformation rules so the mismatch stays resolved', async () => {
    const src = useSchemaSide('source')
    const tgt = useSchemaSide('target')
    const mappings = useMappings()
    const importer = useImport()

    const payload = {
      ...exportPayload,
      fieldMappings: [
        {
          sourceField: 'customerId',
          targetField: 'id',
          transformations: [
            {
              expression: 'substring(0, 10)',
              label: 'Truncate',
              source: 'mismatch-solution',
              resolvesMismatch: 'truncate',
            },
          ],
        },
      ],
    }
    await importer.importMappingSet(jsonFile(payload), src, tgt)

    expect(mappings.mappings[0]!.transformations[0]!.resolvesMismatch).toBe('truncate')
  })

  it('restores schemas only when fieldMappings is empty', async () => {
    const src = useSchemaSide('source')
    const tgt = useSchemaSide('target')
    const mappings = useMappings()
    const importer = useImport()

    const empty = { ...exportPayload, fieldMappings: [] }
    await importer.importMappingSet(jsonFile(empty), src, tgt)

    expect(src.schema.value.all()).toHaveLength(3)
    expect(tgt.schema.value.all()).toHaveLength(2)
    expect(mappings.mappings).toHaveLength(0)
  })

  it('restores AI statistics from the export payload', async () => {
    const src = useSchemaSide('source')
    const tgt = useSchemaSide('target')
    const ai = useAISuggestions()
    const importer = useImport()

    const payload = {
      ...exportPayload,
      statistics: {
        ai: { totalGenerated: 7, accepted: 3, rejected: 2, rejectedPairs: ['a::b', 'c::d'] },
      },
    }
    await importer.importMappingSet(jsonFile(payload), src, tgt)

    expect(ai.totalGenerated).toBe(7)
    expect(ai.accepted).toBe(3)
    expect(ai.rejected).toBe(2)
    expect([...ai.rejectedPairs]).toEqual(['a::b', 'c::d'])
  })

  describe('export version', () => {
    const exportAgain = () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      return useExport().exportMappingSet(
        { schema: src.schema.value, sourceUrl: null },
        { schema: tgt.schema.value, sourceUrl: null },
      )
    }

    // Scenario: Re-importing an exported file preserves its export version
    it('continues the count from the imported export version', async () => {
      await useImport().importMappingSet(
        jsonFile(exportPayload),
        useSchemaSide('source'),
        useSchemaSide('target'),
      )

      expect(exportMetaResource.current()).toEqual({
        exportVersion: 7,
        exportedAt: '2026-06-04T00:00:00.000Z',
      })
      expect(exportAgain().metadata.exportVersion).toBe(8)
    })

    it('replaces a higher local count with the imported one', async () => {
      exportMetaResource.write({ exportVersion: 12, exportedAt: '2026-10-01T00:00:00.000Z' })

      await useImport().importMappingSet(
        jsonFile(exportPayload),
        useSchemaSide('source'),
        useSchemaSide('target'),
      )

      expect(exportAgain().metadata.exportVersion).toBe(8)
    })

    // Scenario: Importing an older export without an export version starts the count again
    it('restarts the count at 1 after importing an older export', async () => {
      exportMetaResource.write({ exportVersion: 4, exportedAt: '2026-10-01T00:00:00.000Z' })
      const { metadata: _m, ...rest } = exportPayload
      const legacy = { version: '1.1', exportedAt: '2026-06-04T00:00:00.000Z', ...rest }

      const importer = useImport()
      await importer.importMappingSet(
        jsonFile(legacy),
        useSchemaSide('source'),
        useSchemaSide('target'),
      )

      expect(importer.error.value).toBeNull()
      expect(exportAgain().metadata.exportVersion).toBe(1)
    })

    // Scenario: Importing a file with an unreadable export version
    it('imports with a warning and restarts the count at 1 when the export version is unreadable', async () => {
      exportMetaResource.write({ exportVersion: 4, exportedAt: '2026-10-01T00:00:00.000Z' })
      const unreadable = { ...exportPayload, metadata: { exportVersion: 'drie' } }

      const importer = useImport()
      await importer.importMappingSet(
        jsonFile(unreadable),
        useSchemaSide('source'),
        useSchemaSide('target'),
      )

      expect(importer.error.value).toBeNull()
      expect(importer.warnings.value.some((w) => /exportversie/i.test(w))).toBe(true)
      expect(exportAgain().metadata.exportVersion).toBe(1)
    })

    it('leaves the count untouched when the import fails', async () => {
      exportMetaResource.write({ exportVersion: 4, exportedAt: '2026-10-01T00:00:00.000Z' })

      await useImport().importMappingSet(
        new File(['{not-json'], 'broken.json', { type: 'application/json' }),
        useSchemaSide('source'),
        useSchemaSide('target'),
      )

      expect(exportMetaResource.current().exportVersion).toBe(4)
    })
  })

  it('replaces existing state on import (does not merge)', async () => {
    const src = useSchemaSide('source')
    const tgt = useSchemaSide('target')
    const mappings = useMappings()
    mappings.createMapping({ sourceFieldId: 'existing-src', targetFieldId: 'existing-tgt' })

    const importer = useImport()
    await importer.importMappingSet(jsonFile(exportPayload), src, tgt)

    expect(mappings.mappings).toHaveLength(2)
    expect(mappings.mappings.find((m) => m.sourceFieldId === 'existing-src')).toBeUndefined()
  })

  describe('error handling', () => {
    function invalidJsonFile(): File {
      return new File(['{not-json'], 'broken.json', { type: 'application/json' })
    }
    function invalidShapeFile(): File {
      return new File([JSON.stringify({ version: '1.1' })], 'bad.json', {
        type: 'application/json',
      })
    }

    it('sets error and returns null when the file is not valid JSON', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const importer = useImport()

      const result = await importer.importMappingSet(invalidJsonFile(), src, tgt)

      expect(result).toBeNull()
      expect(importer.error.value).toBeTruthy()
      expect(importer.error.value).toMatch(/json|format|ongeldig/i)
    })

    it('sets error and returns null when the payload shape is invalid', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const importer = useImport()

      const result = await importer.importMappingSet(invalidShapeFile(), src, tgt)

      expect(result).toBeNull()
      expect(importer.error.value).toBeTruthy()
    })

    it('preserves existing app state when import fails on invalid format', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const mappings = useMappings()
      const ai = useAISuggestions()

      await useImport().importMappingSet(jsonFile(exportPayload), src, tgt)
      const sourceFieldsBefore = src.schema.value.all().map((f) => f.id)
      const targetFieldsBefore = tgt.schema.value.all().map((f) => f.id)
      const mappingsBefore = mappings.mappings.map((m) => ({ ...m }))
      const aiTotalBefore = ai.totalGenerated

      const importer = useImport()
      const result = await importer.importMappingSet(invalidShapeFile(), src, tgt)

      expect(result).toBeNull()
      expect(src.schema.value.all().map((f) => f.id)).toEqual(sourceFieldsBefore)
      expect(tgt.schema.value.all().map((f) => f.id)).toEqual(targetFieldsBefore)
      expect(mappings.mappings).toEqual(mappingsBefore)
      expect(ai.totalGenerated).toBe(aiTotalBefore)
    })

    it('clears the previous error on a successful import', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const importer = useImport()

      await importer.importMappingSet(invalidShapeFile(), src, tgt)
      expect(importer.error.value).toBeTruthy()

      await importer.importMappingSet(jsonFile(exportPayload), src, tgt)
      expect(importer.error.value).toBeNull()
    })

    it('clearError() resets the error ref', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const importer = useImport()

      await importer.importMappingSet(invalidShapeFile(), src, tgt)
      expect(importer.error.value).toBeTruthy()

      importer.clearError()
      expect(importer.error.value).toBeNull()
    })

    it('clearWarnings() resets the warnings ref', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const importer = useImport()

      const payload = { ...exportPayload, metadata: { exportVersion: 'drie' } }
      await importer.importMappingSet(jsonFile(payload), src, tgt)
      expect(importer.warnings.value.length).toBeGreaterThan(0)

      importer.clearWarnings()
      expect(importer.warnings.value).toEqual([])
    })

    it('surfaces deserializer warnings (unreadable export version)', async () => {
      const src = useSchemaSide('source')
      const tgt = useSchemaSide('target')
      const importer = useImport()

      const payload = { ...exportPayload, metadata: { exportVersion: 'drie' } }
      await importer.importMappingSet(jsonFile(payload), src, tgt)

      expect(importer.warnings.value.some((w) => /exportversie/i.test(w))).toBe(true)
    })
  })
})
