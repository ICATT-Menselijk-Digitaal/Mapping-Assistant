import { describe, it, expect } from 'vitest'
import { serializeMappingSet } from '../exportSerializer'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import type { FieldMapping } from '@/types'

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

const mappings: FieldMapping[] = [
  { id: 'm1', sourceFieldId: 'customerId', targetFieldId: 'id', transformations: [], status: 'confirmed' },
  { id: 'm2', sourceFieldId: 'name', targetFieldId: 'fullName', transformations: [], status: 'confirmed' },
]

describe('serializeMappingSet', () => {
  // Scenario: Export object contains source schema, target schema, and mappings
  it('includes version 1.0 in the export object', () => {
    const result = serializeMappingSet(sourceSchema, targetSchema, mappings)
    expect(result.version).toBe('1.0')
  })

  it('includes the source schema name and all its fields', () => {
    const result = serializeMappingSet(sourceSchema, targetSchema, mappings)
    expect(result.sourceSchema.name).toBe('Source')
    expect(result.sourceSchema.fields).toHaveLength(2)
    expect(result.sourceSchema.fields.map((f) => f.path)).toContain('customerId')
  })

  it('includes the target schema name and all its fields', () => {
    const result = serializeMappingSet(sourceSchema, targetSchema, mappings)
    expect(result.targetSchema.name).toBe('Target')
    expect(result.targetSchema.fields).toHaveLength(2)
    expect(result.targetSchema.fields.map((f) => f.path)).toContain('fullName')
  })

  it('includes all field mappings with source and target path strings', () => {
    const result = serializeMappingSet(sourceSchema, targetSchema, mappings)
    expect(result.fieldMappings).toHaveLength(2)
    expect(result.fieldMappings[0]).toMatchObject({ sourceField: 'customerId', targetField: 'id' })
    expect(result.fieldMappings[1]).toMatchObject({ sourceField: 'name', targetField: 'fullName' })
  })

  // Scenario: Export without mappings contains schemas only
  it('produces an empty fieldMappings list when no mappings are provided', () => {
    const result = serializeMappingSet(sourceSchema, targetSchema, [])
    expect(result.fieldMappings).toHaveLength(0)
    expect(result.sourceSchema.name).toBe('Source')
    expect(result.targetSchema.name).toBe('Target')
  })
})
