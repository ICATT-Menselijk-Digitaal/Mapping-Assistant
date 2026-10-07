import { describe, expect, it } from 'vitest'
import { buildSchema } from '@/domain/schema'
import type { FieldMapping } from '@/types/mapping'
import type { ExportedFieldMapping } from '@/utils/exportSerializer'
import {
  addDefaultValueCoupling,
  addMapping,
  addRule,
  clearDefaultValue,
  hasCouplingForTarget,
  makeMapping,
  MAX_COMMENT_LENGTH,
  removeComment,
  removeMapping,
  removeRule,
  restoreMappings,
  setComment,
  setDefaultValue,
  toggleMismatch,
  updateRule,
} from '../mappingOps'

function base(): FieldMapping {
  return makeMapping({ sourceFieldId: 's1', targetFieldId: 't1' })
}

describe('mappingOps', () => {
  it('addMapping appends and returns the created mapping', () => {
    const { list, created } = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(created).not.toBeNull()
    expect(created!.status).toBe('confirmed')
    expect(list).toHaveLength(1)
  })

  it('addMapping rejects a duplicate source→target pair', () => {
    const first = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
    const second = addMapping(first.list, { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(second.created).toBeNull()
    expect(second.list).toHaveLength(1)
  })

  it('addMapping does not mutate the input list', () => {
    const input: FieldMapping[] = []
    addMapping(input, { sourceFieldId: 's1', targetFieldId: 't1' })
    expect(input).toEqual([])
  })

  it('removeMapping drops the mapping by id', () => {
    const m = base()
    expect(removeMapping([m], m.id)).toEqual([])
  })

  it('addRule / updateRule / removeRule edit a mapping immutably and keep rule ids', () => {
    const m = base()
    let list = addRule([m], m.id, { expression: '$', label: 'identity', source: 'manual' })
    const ruleId = list[0]!.transformations[0]!.id

    list = updateRule(list, m.id, ruleId, { label: 'renamed', id: 'should-be-ignored' as never })
    expect(list[0]!.transformations[0]!.id).toBe(ruleId)
    expect(list[0]!.transformations[0]!.label).toBe('renamed')

    list = removeRule(list, m.id, ruleId)
    expect(list[0]!.transformations).toEqual([])
  })

  it('toggleMismatch adds then removes a manual resolution', () => {
    const m = base()
    let list = toggleMismatch([m], m.id, 'truncate')
    expect(list[0]!.manuallyResolvedMismatches).toEqual(['truncate'])
    list = toggleMismatch(list, m.id, 'truncate')
    expect(list[0]!.manuallyResolvedMismatches).toEqual([])
  })

  it('restoreMappings flags mappings whose paths no longer resolve as orphaned', () => {
    const schema = buildSchema('s', [
      { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
    ])
    const exported: ExportedFieldMapping[] = [
      { sourceField: 'a', targetField: 'a', transformations: [] },
      { sourceField: 'missing', targetField: 'a', transformations: [] },
    ]
    const restored = restoreMappings(exported, schema, schema)
    expect(restored[0]!.orphaned).toBeUndefined()
    expect(restored[1]!.orphaned).toBe(true)
  })

  // A source-less coupling is never orphaned on its source side — it never had one.
  it('restoreMappings does not flag a source-less coupling as orphaned', () => {
    const schema = buildSchema('s', [
      { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
    ])
    const exported: ExportedFieldMapping[] = [
      {
        sourceField: null,
        targetField: 'a',
        transformations: [],
        defaultValue: { value: 'standaard', dataType: 'string' },
      },
    ]
    const [restored] = restoreMappings(exported, schema, schema)
    expect(restored!.sourceFieldId).toBeNull()
    expect(restored!.orphaned).toBeUndefined()
    expect(restored!.defaultValue).toEqual({ value: 'standaard', dataType: 'string' })
  })

  it('restoreMappings still flags a source-less coupling as orphaned if its target path is gone', () => {
    const schema = buildSchema('s', [])
    const exported: ExportedFieldMapping[] = [
      { sourceField: null, targetField: 'missing', transformations: [] },
    ]
    const [restored] = restoreMappings(exported, schema, schema)
    expect(restored!.orphaned).toBe(true)
  })

  // Scenario: Importing an orphaned Koppeling still restores its comment
  it('restoreMappings carries a comment through even for an orphaned mapping', () => {
    const schema = buildSchema('s', [
      { id: 'a', name: 'a', path: 'a', dataType: 'string', required: false },
    ])
    const exported: ExportedFieldMapping[] = [
      {
        sourceField: 'missing',
        targetField: 'a',
        transformations: [],
        comment: 'Belangrijke context',
        commentedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    const [restored] = restoreMappings(exported, schema, schema)
    expect(restored!.orphaned).toBe(true)
    expect(restored!.comment).toBe('Belangrijke context')
    expect(restored!.commentedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns the SAME reference on a no-op (unknown id) so callers can skip the write', () => {
    const m = base()
    const list = addRule([m], m.id, { expression: '$', label: 'x', source: 'manual' })

    expect(removeMapping(list, 'missing')).toBe(list)
    expect(addRule(list, 'missing', { expression: '$', label: 'x', source: 'manual' })).toBe(list)
    expect(removeRule(list, m.id, 'missing-rule')).toBe(list)
    expect(updateRule(list, m.id, 'missing-rule', { label: 'x' })).toBe(list)
    expect(toggleMismatch(list, 'missing', 'truncate')).toBe(list)
    expect(setComment(list, 'missing', 'hi')).toBe(list)
    expect(removeComment(list, 'missing')).toBe(list)
  })

  describe('setComment / removeComment', () => {
    // Scenario: Adding a comment to a Koppeling
    it('setComment adds a comment and a commentedAt timestamp', () => {
      const m = base()
      const before = new Date().toISOString()
      const list = setComment([m], m.id, 'Belangrijke context')
      expect(list[0]!.comment).toBe('Belangrijke context')
      expect(list[0]!.commentedAt).toBeDefined()
      expect(list[0]!.commentedAt! >= before).toBe(true)
    })

    // Scenario: Editing an existing comment
    it('setComment overwrites an existing comment and refreshes commentedAt', () => {
      const m = base()
      const first = setComment([m], m.id, 'Eerste versie')
      const firstTimestamp = first[0]!.commentedAt
      const second = setComment(first, m.id, 'Tweede versie')
      expect(second[0]!.comment).toBe('Tweede versie')
      expect(second[0]!.commentedAt! >= firstTimestamp!).toBe(true)
    })

    // Scenario: Comment length is capped while composing
    it('setComment truncates to MAX_COMMENT_LENGTH', () => {
      const m = base()
      const tooLong = 'x'.repeat(MAX_COMMENT_LENGTH + 50)
      const list = setComment([m], m.id, tooLong)
      expect(list[0]!.comment).toHaveLength(MAX_COMMENT_LENGTH)
    })

    // Scenario: Removing an existing comment
    it('removeComment clears comment and commentedAt', () => {
      const m = base()
      const withComment = setComment([m], m.id, 'Weg ermee')
      const list = removeComment(withComment, m.id)
      expect(list[0]!.comment).toBeUndefined()
      expect(list[0]!.commentedAt).toBeUndefined()
    })

    it('removeComment is a no-op when the mapping has no comment', () => {
      const m = base()
      const list = [m]
      expect(removeComment(list, m.id)).toBe(list)
    })

    it('does not mutate the input list', () => {
      const m = base()
      const input = [m]
      setComment(input, m.id, 'x')
      expect(input[0]).toBe(m)
      expect(input[0]!.comment).toBeUndefined()
    })
  })

  it('returns a NEW reference when something actually changes', () => {
    const m = base()
    const list = [m]
    expect(removeMapping(list, m.id)).not.toBe(list)
    expect(addRule(list, m.id, { expression: '$', label: 'x', source: 'manual' })).not.toBe(list)
    expect(toggleMismatch(list, m.id, 'truncate')).not.toBe(list)
  })

  describe('addDefaultValueCoupling / setDefaultValue / clearDefaultValue', () => {
    it('addDefaultValueCoupling appends a coupling with a null sourceFieldId', () => {
      const { list, created } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(created).not.toBeNull()
      expect(created!.sourceFieldId).toBeNull()
      expect(created!.targetFieldId).toBe('t1')
      expect(list).toHaveLength(1)
    })

    // Edge Case: Target field already has a coupling
    it('rejects a target that already has a source-bound coupling', () => {
      const { list } = addMapping([], { sourceFieldId: 's1', targetFieldId: 't1' })
      const result = addDefaultValueCoupling(list, { targetFieldId: 't1' })
      expect(result.created).toBeNull()
      expect(result.list).toHaveLength(1)
    })

    it('rejects a target that already has a default-value coupling', () => {
      const first = addDefaultValueCoupling([], { targetFieldId: 't1' })
      const second = addDefaultValueCoupling(first.list, { targetFieldId: 't1' })
      expect(second.created).toBeNull()
      expect(second.list).toHaveLength(1)
    })

    it('hasCouplingForTarget reflects both source-bound and source-less couplings', () => {
      expect(hasCouplingForTarget([], 't1')).toBe(false)
      const { list } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(hasCouplingForTarget(list, 't1')).toBe(true)
    })

    it('setDefaultValue sets a validated value on the coupling', () => {
      const { list, created } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      const updated = setDefaultValue(list, created!.id, { value: 'actief', dataType: 'string' })
      expect(updated[0]!.defaultValue).toEqual({ value: 'actief', dataType: 'string' })
    })

    it('clearDefaultValue removes a previously-set value', () => {
      const { list, created } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      const withValue = setDefaultValue(list, created!.id, { value: 'actief', dataType: 'string' })
      const cleared = clearDefaultValue(withValue, created!.id)
      expect(cleared[0]!.defaultValue).toBeUndefined()
    })

    it('clearDefaultValue is a no-op when there is nothing to clear', () => {
      const { list } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(clearDefaultValue(list, list[0]!.id)).toBe(list)
    })

    it('setDefaultValue / clearDefaultValue are no-ops for an unknown id', () => {
      const { list } = addDefaultValueCoupling([], { targetFieldId: 't1' })
      expect(setDefaultValue(list, 'missing', { value: 'x', dataType: 'string' })).toBe(list)
      expect(clearDefaultValue(list, 'missing')).toBe(list)
    })
  })
})
