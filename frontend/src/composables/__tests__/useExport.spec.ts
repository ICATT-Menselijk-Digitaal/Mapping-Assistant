import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useExport } from '../useExport'
import { useMappings } from '../useMappings'
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
  // Scenario: Export object contains source schema, target schema, and mappings
  it('returns a MappingSetExport with schemas and all field mappings', () => {
    const mappings = useMappings()
    mappings.createMapping({ sourceFieldId: 'customerId', targetFieldId: 'id' })

    const exporter = useExport()
    const result = exporter.exportMappingSet(sourceSchema, targetSchema)

    expect(result.version).toBe('1.0')
    expect(result.sourceSchema.name).toBe('Source')
    expect(result.targetSchema.name).toBe('Target')
    expect(result.fieldMappings).toHaveLength(1)
    expect(result.fieldMappings[0]).toMatchObject({ sourceField: 'customerId', targetField: 'id' })
  })

  it('emits a MappingSetExported event with the correct type and timestamp', () => {
    const exporter = useExport()
    exporter.exportMappingSet(sourceSchema, targetSchema)

    const event = exporter.lastEvent.value
    expect(event).not.toBeNull()
    expect(event?.type).toBe('MappingSetExported')
    expect(event?.timestamp).toBeTruthy()
    expect(event?.payload.version).toBe('1.0')
  })

  // Scenario: Export without mappings contains schemas only
  it('produces an export with empty fieldMappings when no mappings exist', () => {
    const exporter = useExport()
    const result = exporter.exportMappingSet(sourceSchema, targetSchema)

    expect(result.fieldMappings).toHaveLength(0)
    expect(result.sourceSchema.name).toBe('Source')
    expect(result.targetSchema.name).toBe('Target')
  })
})
