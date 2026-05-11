import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMappings } from '../useMappings'

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
    expect(truncate?.truncationMaxLength).toBe(40)
  })

  it('is a no-op when mapping id does not exist', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(() =>
      store.updateTransformation('non-existent', { type: 'truncate', truncationMaxLength: 40 }),
    ).not.toThrow()
    expect(store.mappings[0]!.transformations[0]!.type).toBe('direct')
  })

  it('dispatches TransformationRuleAdded custom event on update', () => {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!
    const events: CustomEvent[] = []
    window.addEventListener('TransformationRuleAdded', (e) => events.push(e as CustomEvent))

    store.updateTransformation(mapping.id, { type: 'truncate', truncationMaxLength: 40 })

    expect(events).toHaveLength(1)
    expect(events[0]!.detail).toMatchObject({
      mappingId: mapping.id,
      rule: { type: 'truncate', truncationMaxLength: 40 },
    })
  })
})
