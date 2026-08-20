import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import { useSuggestionScope, leavesUnder } from '@/composables/useSuggestionScope'

const nodes: SchemaFieldNode[] = [
  {
    id: 'root',
    name: 'Zaak',
    path: 'Zaak',
    dataType: 'object',
    required: false,
    children: [
      { id: 'leaf-1', name: 'id', path: 'Zaak.id', dataType: 'string', required: true },
      {
        id: 'nested',
        name: 'betrokkene',
        path: 'Zaak.betrokkene',
        dataType: 'object',
        required: false,
        children: [
          {
            id: 'leaf-2',
            name: 'naam',
            path: 'Zaak.betrokkene.naam',
            dataType: 'string',
            required: false,
          },
        ],
      },
    ],
  },
  {
    id: 'root-2',
    name: 'Overig',
    path: 'Overig',
    dataType: 'object',
    required: false,
    children: [
      { id: 'leaf-3', name: 'code', path: 'Overig.code', dataType: 'string', required: false },
    ],
  },
]
const schema = buildSchema('Test', nodes)

const SOURCE_KEY = 'ma_suggestion_scope_source_root_ids'
const TARGET_KEY = 'ma_suggestion_scope_target_root_ids'

describe('leavesUnder', () => {
  it('collects every leaf descendant of the given roots', () => {
    const ids = leavesUnder(schema, ['root'])
      .map((f) => f.id)
      .sort()
    expect(ids).toEqual(['leaf-1', 'leaf-2'])
  })

  it('returns [] when no roots are selected', () => {
    expect(leavesUnder(schema, [])).toEqual([])
  })

  it('treats a selected leaf-root as itself', () => {
    expect(leavesUnder(schema, ['leaf-3']).map((f) => f.id)).toEqual(['leaf-3'])
  })
})

describe('useSuggestionScope store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem(SOURCE_KEY)
    localStorage.removeItem(TARGET_KEY)
  })

  it('starts with empty selections when localStorage is empty', () => {
    const store = useSuggestionScope()
    expect(store.hasSourceSelection).toBe(false)
    expect(store.hasTargetSelection).toBe(false)
  })

  it('toggle adds and removes ids per side', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root')
    expect(store.isSelected('source', 'root')).toBe(true)
    expect(store.isSelected('target', 'root')).toBe(false)
    store.toggle('source', 'root')
    expect(store.isSelected('source', 'root')).toBe(false)
  })

  it('source and target selections are independent', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root')
    store.toggle('target', 'root-2')
    expect([...store.selectedSourceRootIds]).toEqual(['root'])
    expect([...store.selectedTargetRootIds]).toEqual(['root-2'])
  })

  it('clear empties one side without touching the other', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root')
    store.toggle('target', 'root-2')
    store.clear('source')
    expect(store.hasSourceSelection).toBe(false)
    expect(store.hasTargetSelection).toBe(true)
  })

  it('persists each side to its own localStorage key', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root')
    store.toggle('target', 'root-2')
    expect(JSON.parse(localStorage.getItem(SOURCE_KEY)!)).toEqual(['root'])
    expect(JSON.parse(localStorage.getItem(TARGET_KEY)!)).toEqual(['root-2'])
  })

  it('restores each side from its localStorage key on a fresh store', () => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(['root']))
    localStorage.setItem(TARGET_KEY, JSON.stringify(['root-2']))
    setActivePinia(createPinia())
    const store = useSuggestionScope()
    expect(store.isSelected('source', 'root')).toBe(true)
    expect(store.isSelected('target', 'root-2')).toBe(true)
  })

  it('pruneAgainst drops ids that no longer match a schema root', () => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(['root', 'ghost-id']))
    setActivePinia(createPinia())
    const store = useSuggestionScope()
    store.pruneAgainst('source', schema)
    expect(store.isSelected('source', 'root')).toBe(true)
    expect(store.isSelected('source', 'ghost-id')).toBe(false)
  })

  it('scopedLeaves returns leaf descendants of selected roots for the given side', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root-2')
    store.toggle('target', 'root')
    expect(store.scopedLeaves('source', schema).map((f) => f.id)).toEqual(['leaf-3'])
    const targetIds = store.scopedLeaves('target', schema).map((f) => f.id).sort()
    expect(targetIds).toEqual(['leaf-1', 'leaf-2'])
  })
})
