import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMappings } from '../useMappings'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useMappings', () => {
  // Scenario: Select source field and map to target field
  it('creates a mapping from sourceFieldId to targetFieldId', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(store.mappings).toHaveLength(1)
    expect(store.mappings[0]!.sourceFieldId).toBe('src-1')
    expect(store.mappings[0]!.targetFieldId).toBe('tgt-1')
  })

  it('assigns a unique id to each mapping', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })

    expect(store.mappings[0]!.id).toBeTruthy()
    expect(store.mappings[1]!.id).toBeTruthy()
    expect(store.mappings[0]!.id).not.toBe(store.mappings[1]!.id)
  })

  it('returns the created FieldMapping from createMapping', () => {
    const store = useMappings()
    const result = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(result).not.toBeNull()
    expect(result?.sourceFieldId).toBe('src-1')
  })

  // Many-to-many: one source can map to multiple targets
  it('allows the same source field to map to multiple target fields', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    const second = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })

    expect(second).not.toBeNull()
    expect(store.mappings).toHaveLength(2)
  })

  // Many-to-many: multiple sources can map to the same target
  it('allows multiple source fields to map to the same target field', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    const second = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-1' })

    expect(second).not.toBeNull()
    expect(store.mappings).toHaveLength(2)
  })

  // Duplicate pair prevention
  it('returns null for an exact duplicate source-target pair', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    const duplicate = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(duplicate).toBeNull()
    expect(store.mappings).toHaveLength(1)
  })

  it('hasMapping returns true when source field has an active mapping', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(store.hasMapping('src-1')).toBe(true)
  })

  it('hasMapping returns false when source field has no mapping', () => {
    const store = useMappings()
    expect(store.hasMapping('src-1')).toBe(false)
  })

  // Remove mapping
  it('removes a mapping by id', () => {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    store.removeMapping(mapping!.id)

    expect(store.mappings).toHaveLength(0)
  })

  it('only removes the mapping with the given id', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    const second = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-2' })

    store.removeMapping(second!.id)

    expect(store.mappings).toHaveLength(1)
    expect(store.mappings[0]!.sourceFieldId).toBe('src-1')
  })

  // updateTransformation
  it('updates the transformation on a mapping by id', () => {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

    store.updateTransformation(mapping.id, { type: 'truncate', truncationMaxLength: 40 })

    const truncate = store.mappings[0]!.transformations.find((r) => r.type === 'truncate')
    expect(truncate?.type).toBe('truncate')
    if (truncate?.type === 'truncate') {
      expect(truncate.truncationMaxLength).toBe(40)
    }
  })

  it('is a no-op when mapping id does not exist', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(() =>
      store.updateTransformation('non-existent', { type: 'truncate', truncationMaxLength: 40 }),
    ).not.toThrow()
    expect(store.mappings[0]!.transformations[0]!.type).toBe('direct')
  })

  // Scenario: Mappings overview reflects computed statuses reactively
  describe('mappingsWithStatus', () => {
    function makeSchema(fields: { id: string; dataType: string; maxLength?: number; required?: boolean }[]) {
      const nodes: SchemaFieldNode[] = fields.map((f) => ({
        id: f.id,
        name: f.id,
        path: f.id,
        dataType: f.dataType as SchemaFieldNode['dataType'],
        required: f.required ?? false,
        maxLength: f.maxLength,
        children: [],
      }))
      return buildSchema('test', nodes)
    }

    it('returns compatible status for a compatible coupling', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'src-num', targetFieldId: 'tgt-str' })

      const sourceSchema = makeSchema([{ id: 'src-num', dataType: 'number' }])
      const targetSchema = makeSchema([{ id: 'tgt-str', dataType: 'string' }])

      const result = store.mappingsWithStatus(sourceSchema, targetSchema)
      expect(result[0]!.validationStatus).toBe('compatible')
    })

    it('returns incompatible status for an incompatible coupling', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'src-obj', targetFieldId: 'tgt-str' })

      const sourceSchema = makeSchema([{ id: 'src-obj', dataType: 'object' }])
      const targetSchema = makeSchema([{ id: 'tgt-str', dataType: 'string' }])

      const result = store.mappingsWithStatus(sourceSchema, targetSchema)
      expect(result[0]!.validationStatus).toBe('incompatible')
    })

    it('returns constrained when field lookup fails', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'missing', targetFieldId: 'tgt-str' })

      const sourceSchema = makeSchema([])
      const targetSchema = makeSchema([{ id: 'tgt-str', dataType: 'string' }])

      const result = store.mappingsWithStatus(sourceSchema, targetSchema)
      expect(result[0]!.validationStatus).toBe('constrained')
    })
  })

  describe('createMapping with schemas', () => {
    function makeSchema(fields: { id: string; dataType: string; maxLength?: number; required?: boolean }[]) {
      const nodes: SchemaFieldNode[] = fields.map((f) => ({
        id: f.id,
        name: f.id,
        path: f.id,
        dataType: f.dataType as SchemaFieldNode['dataType'],
        required: f.required ?? false,
        maxLength: f.maxLength,
        children: [],
      }))
      return buildSchema('test', nodes)
    }

    it('stubs truncate rule for string source exceeding target maxLength', () => {
      const store = useMappings()
      const source = makeSchema([{ id: 'src', dataType: 'string', maxLength: 100 }])
      const target = makeSchema([{ id: 'tgt', dataType: 'string', maxLength: 50 }])

      store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt', schemas: { source, target } })

      const m = store.mappings[0]!
      expect(m.transformations.some((r) => r.type === 'truncate')).toBe(true)
      expect(m.transformations.some((r) => r.type === 'direct')).toBe(true)
    })

    it('stubs default rule when source is optional and target is required', () => {
      const store = useMappings()
      const source = makeSchema([{ id: 'src', dataType: 'string', required: false }])
      const target = makeSchema([{ id: 'tgt', dataType: 'string', required: true }])

      store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt', schemas: { source, target } })

      expect(store.mappings[0]!.transformations.some((r) => r.type === 'default')).toBe(true)
    })

    it('stubs both truncate and default for optional long string → required short string', () => {
      const store = useMappings()
      const source = makeSchema([{ id: 'src', dataType: 'string', maxLength: 100, required: false }])
      const target = makeSchema([{ id: 'tgt', dataType: 'string', maxLength: 50, required: true }])

      store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt', schemas: { source, target } })

      const types = store.mappings[0]!.transformations.map((r) => r.type)
      expect(types).toContain('truncate')
      expect(types).toContain('default')
    })

    it('stubs date-format rule for date-to-date mapping', () => {
      const store = useMappings()
      const source = makeSchema([{ id: 'src', dataType: 'date' }])
      const target = makeSchema([{ id: 'tgt', dataType: 'date' }])

      store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt', schemas: { source, target } })

      expect(store.mappings[0]!.transformations.some((r) => r.type === 'date-format')).toBe(true)
    })

    it('falls back to only direct when schemas not provided', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })

      expect(store.mappings[0]!.transformations).toEqual([{ type: 'direct' }])
    })

    it('falls back to only direct when field ids not found in schema', () => {
      const store = useMappings()
      const source = makeSchema([])
      const target = makeSchema([])

      store.createMapping({ sourceFieldId: 'missing', targetFieldId: 'also-missing', schemas: { source, target } })

      expect(store.mappings[0]!.transformations).toEqual([{ type: 'direct' }])
    })
  })

})
