import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSchema, type SchemaFieldNode } from '@/domain/schema'
import {
  useSuggestionScope,
  listContainers,
  leavesUnder,
} from '@/composables/useSuggestionScope'

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

describe('useSuggestionScope helpers', () => {
  it('listContainers returns object/array fields that have children', () => {
    const ids = listContainers(schema).map((f) => f.id).sort()
    expect(ids).toEqual(['nested', 'root', 'root-2'])
  })

  it('leavesUnder collects leaf descendants of the given containers', () => {
    const ids = leavesUnder(schema, ['root']).map((f) => f.id).sort()
    expect(ids).toEqual(['leaf-1', 'leaf-2'])
  })

  it('leavesUnder returns [] when no containers selected', () => {
    expect(leavesUnder(schema, [])).toEqual([])
  })
})

describe('useSuggestionScope store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.removeItem('ma_suggestion_scope_source_container_ids')
  })

  it('starts with empty selection when localStorage is empty', () => {
    const store = useSuggestionScope()
    expect(store.hasSelection).toBe(false)
    expect(store.selectedSourceContainerIds.size).toBe(0)
  })

  it('toggle adds and removes container ids', () => {
    const store = useSuggestionScope()
    store.toggle('root')
    expect(store.isSelected('root')).toBe(true)
    store.toggle('root')
    expect(store.isSelected('root')).toBe(false)
  })

  it('selectAll picks every container in the schema', () => {
    const store = useSuggestionScope()
    store.selectAll(schema)
    expect(store.selectedSourceContainerIds.size).toBe(3)
  })

  it('clear empties the selection', () => {
    const store = useSuggestionScope()
    store.selectAll(schema)
    store.clear()
    expect(store.hasSelection).toBe(false)
  })

  it('persists selection to localStorage', () => {
    const store = useSuggestionScope()
    store.toggle('root')
    const raw = localStorage.getItem('ma_suggestion_scope_source_container_ids')
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!)).toContain('root')
  })

  it('restores selection from localStorage on new store instance', () => {
    localStorage.setItem(
      'ma_suggestion_scope_source_container_ids',
      JSON.stringify(['root', 'nested']),
    )
    setActivePinia(createPinia())
    const store = useSuggestionScope()
    expect(store.isSelected('root')).toBe(true)
    expect(store.isSelected('nested')).toBe(true)
  })

  it('pruneAgainst drops ids that no longer match a container', () => {
    localStorage.setItem(
      'ma_suggestion_scope_source_container_ids',
      JSON.stringify(['root', 'ghost-id']),
    )
    setActivePinia(createPinia())
    const store = useSuggestionScope()
    store.pruneAgainst(schema)
    expect(store.isSelected('root')).toBe(true)
    expect(store.isSelected('ghost-id')).toBe(false)
  })

  it('scopedSourceLeaves returns leaf descendants of selected containers only', () => {
    const store = useSuggestionScope()
    store.toggle('root-2')
    const ids = store.scopedSourceLeaves(schema).map((f) => f.id)
    expect(ids).toEqual(['leaf-3'])
  })
})
