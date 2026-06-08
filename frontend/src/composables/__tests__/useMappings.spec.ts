import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMappings } from '../useMappings'
import { buildSchema } from '@/domain/schema'
import type { SchemaFieldNode } from '@/domain/schema'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useMappings', () => {
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

  it('allows the same source field to map to multiple target fields', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    const second = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-2' })

    expect(second).not.toBeNull()
    expect(store.mappings).toHaveLength(2)
  })

  it('allows multiple source fields to map to the same target field', () => {
    const store = useMappings()
    store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
    const second = store.createMapping({ sourceFieldId: 'src-2', targetFieldId: 'tgt-1' })

    expect(second).not.toBeNull()
    expect(store.mappings).toHaveLength(2)
  })

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

  // Scenario: New mappings start with an empty rule list
  it('new mappings start with an empty transformation rule list', () => {
    const store = useMappings()
    const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })

    expect(mapping!.transformations).toEqual([])
  })

  // Scenario: Adding a rule appends it with a unique id
  describe('addTransformationRule', () => {
    it('appends a rule with a unique id', () => {
      const store = useMappings()
      const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

      store.addTransformationRule(mapping.id, { expression: '$string($)', label: 'Naar tekst', source: 'manual' })

      expect(store.mappings[0]!.transformations).toHaveLength(1)
      expect(store.mappings[0]!.transformations[0]!.id).toBeTruthy()
    })

    it('appends multiple rules with distinct ids', () => {
      const store = useMappings()
      const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

      store.addTransformationRule(mapping.id, { expression: '$string($)', label: 'A', source: 'manual' })
      store.addTransformationRule(mapping.id, { expression: '$trim($)', label: 'B', source: 'manual' })

      const ids = store.mappings[0]!.transformations.map((r) => r.id)
      expect(ids[0]).not.toBe(ids[1])
    })

    it('is a no-op for an unknown mappingId', () => {
      const store = useMappings()
      expect(() =>
        store.addTransformationRule('unknown', { expression: '$', label: 'x', source: 'manual' }),
      ).not.toThrow()
    })
  })

  // Scenario: Removing a rule deletes it from the mapping
  describe('removeTransformationRule', () => {
    it('removes the rule with the matching id', () => {
      const store = useMappings()
      const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

      store.addTransformationRule(mapping.id, { expression: '$string($)', label: 'A', source: 'manual' })
      const ruleId = store.mappings[0]!.transformations[0]!.id

      store.removeTransformationRule(mapping.id, ruleId)

      expect(store.mappings[0]!.transformations).toHaveLength(0)
    })

    it('is a no-op for an unknown ruleId', () => {
      const store = useMappings()
      const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

      store.addTransformationRule(mapping.id, { expression: '$string($)', label: 'A', source: 'manual' })

      expect(() => store.removeTransformationRule(mapping.id, 'nonexistent')).not.toThrow()
      expect(store.mappings[0]!.transformations).toHaveLength(1)
    })
  })

  // Scenario: Updating a rule patches only the specified fields
  describe('updateTransformationRule', () => {
    it('patches only the specified fields', () => {
      const store = useMappings()
      const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

      store.addTransformationRule(mapping.id, { expression: '$string($)', label: 'Oud label', source: 'manual' })
      const ruleId = store.mappings[0]!.transformations[0]!.id

      store.updateTransformationRule(mapping.id, ruleId, { label: 'Nieuw label' })

      const rule = store.mappings[0]!.transformations[0]!
      expect(rule.label).toBe('Nieuw label')
      expect(rule.expression).toBe('$string($)')
      expect(rule.source).toBe('manual')
    })

    it('does not overwrite the rule id', () => {
      const store = useMappings()
      const mapping = store.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })!

      store.addTransformationRule(mapping.id, { expression: '$', label: 'A', source: 'manual' })
      const originalId = store.mappings[0]!.transformations[0]!.id

      store.updateTransformationRule(mapping.id, originalId, { id: 'tampered-id' } as any)

      expect(store.mappings[0]!.transformations[0]!.id).toBe(originalId)
    })
  })

  describe('mappingsWithStatus', () => {
    function makeSchema(fields: { id: string; dataType: string }[]) {
      const nodes: SchemaFieldNode[] = fields.map((f) => ({
        id: f.id, name: f.id, path: f.id,
        dataType: f.dataType as SchemaFieldNode['dataType'],
        required: false, children: [],
      }))
      return buildSchema('test', nodes)
    }

    it('returns compatible status for a compatible coupling', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'src-num', targetFieldId: 'tgt-str' })

      const result = store.mappingsWithStatus(
        makeSchema([{ id: 'src-num', dataType: 'number' }]),
        makeSchema([{ id: 'tgt-str', dataType: 'string' }]),
      )
      expect(result[0]!.validationStatus).toBe('compatible')
    })

    it('returns constrained when field lookup fails', () => {
      const store = useMappings()
      store.createMapping({ sourceFieldId: 'missing', targetFieldId: 'tgt-str' })

      const result = store.mappingsWithStatus(
        makeSchema([]),
        makeSchema([{ id: 'tgt-str', dataType: 'string' }]),
      )
      expect(result[0]!.validationStatus).toBe('constrained')
    })
  })

  describe('toggleManualMismatchResolution', () => {
    // Scenario: Administrator marks an unresolved mismatch as fixed
    it('adds a MismatchType to manuallyResolvedMismatches when not present', () => {
      const store = useMappings()
      const m = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
      store.toggleManualMismatchResolution(m.id, 'truncate')
      expect(store.mappings[0]!.manuallyResolvedMismatches).toContain('truncate')
    })

    // Scenario: Administrator unmarks a manually resolved mismatch
    it('removes a MismatchType from manuallyResolvedMismatches when already present', () => {
      const store = useMappings()
      const m = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
      store.toggleManualMismatchResolution(m.id, 'truncate')
      store.toggleManualMismatchResolution(m.id, 'truncate')
      expect(store.mappings[0]!.manuallyResolvedMismatches).not.toContain('truncate')
    })

    it('does nothing when the mapping id is not found', () => {
      const store = useMappings()
      expect(() => store.toggleManualMismatchResolution('nonexistent', 'truncate')).not.toThrow()
    })

    it('does not affect other mismatch types on the same mapping', () => {
      const store = useMappings()
      const m = store.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!
      store.toggleManualMismatchResolution(m.id, 'truncate')
      store.toggleManualMismatchResolution(m.id, 'default')
      expect(store.mappings[0]!.manuallyResolvedMismatches).toContain('truncate')
      expect(store.mappings[0]!.manuallyResolvedMismatches).toContain('default')
    })
  })
})
