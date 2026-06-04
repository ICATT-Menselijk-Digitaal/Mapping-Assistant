import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useImport } from '../useImport'
import { useMappings } from '../useMappings'
import { useSourceSchema } from '../useSourceSchema'
import { useTargetSchema } from '../useTargetSchema'
import type { MappingSetExport } from '@/utils/exportSerializer'

const exportPayload: MappingSetExport = {
  version: '1.1',
  exportedAt: '2026-06-04T00:00:00.000Z',
  sourceSchema: {
    name: 'Source',
    sourceUrl: null,
    fields: [
      { id: 'customerId', name: 'customerId', path: 'customerId', dataType: 'string', required: true },
      { id: 'address', name: 'address', path: 'address', dataType: 'object', required: false },
      { id: 'address.city', name: 'city', path: 'address.city', dataType: 'string', required: false },
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
      transformations: [{ expression: 'substring(0, 10)', label: 'Truncate', source: 'mismatch-solution' }],
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
    const src = useSourceSchema()
    const tgt = useTargetSchema()
    const mappings = useMappings()
    const importer = useImport()

    await importer.importMappingSet(jsonFile(exportPayload), src, tgt)

    expect(src.schema.value.name).toBe('Source')
    expect(src.schema.value.all().map((f) => f.id)).toEqual(['customerId', 'address', 'address.city'])
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
    const src = useSourceSchema()
    const tgt = useTargetSchema()
    const importer = useImport()

    await importer.importMappingSet(jsonFile(exportPayload), src, tgt)

    expect(importer.lastEvent.value).not.toBeNull()
    expect(importer.lastEvent.value?.type).toBe('MappingSetImported')
    expect(importer.lastEvent.value?.timestamp).toBeTruthy()
    expect(importer.lastEvent.value?.payload.version).toBe('1.1')
  })

  it('restores schemas only when fieldMappings is empty', async () => {
    const src = useSourceSchema()
    const tgt = useTargetSchema()
    const mappings = useMappings()
    const importer = useImport()

    const empty = { ...exportPayload, fieldMappings: [] }
    await importer.importMappingSet(jsonFile(empty), src, tgt)

    expect(src.schema.value.all()).toHaveLength(3)
    expect(tgt.schema.value.all()).toHaveLength(2)
    expect(mappings.mappings).toHaveLength(0)
  })

  it('replaces existing state on import (does not merge)', async () => {
    const src = useSourceSchema()
    const tgt = useTargetSchema()
    const mappings = useMappings()
    mappings.createMapping({ sourceFieldId: 'existing-src', targetFieldId: 'existing-tgt' })

    const importer = useImport()
    await importer.importMappingSet(jsonFile(exportPayload), src, tgt)

    expect(mappings.mappings).toHaveLength(2)
    expect(mappings.mappings.find((m) => m.sourceFieldId === 'existing-src')).toBeUndefined()
  })
})
