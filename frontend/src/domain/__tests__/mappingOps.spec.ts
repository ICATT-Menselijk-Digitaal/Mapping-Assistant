import { describe, expect, it } from 'vitest'
import { buildSchema } from '@/domain/schema'
import type { FieldMapping } from '@/types/mapping'
import type { ExportedFieldMapping } from '@/utils/exportSerializer'
import {
  addMapping,
  addRule,
  makeMapping,
  removeMapping,
  removeRule,
  restoreMappings,
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
})
