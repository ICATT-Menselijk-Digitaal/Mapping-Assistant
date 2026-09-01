import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSchema, EMPTY_SCHEMA, type SchemaFieldNode } from '@/domain/schema'
import { useSuggestionScope, leavesUnder } from '@/composables/useSuggestionScope'
import { sourceSchemaResource, targetSchemaResource } from '@/api/resources'

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

function seedSchemas(sourceSchema = schema, targetSchema = schema): void {
  sourceSchemaResource.write({ schema: sourceSchema, sourceUrl: null })
  targetSchemaResource.write({ schema: targetSchema, sourceUrl: null })
}

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
    seedSchemas()
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
    seedSchemas()
    const store = useSuggestionScope()
    expect(store.isSelected('source', 'root')).toBe(true)
    expect(store.isSelected('target', 'root-2')).toBe(true)
  })

  it('auto-prunes stored ids that no longer match a schema root on init', () => {
    localStorage.setItem(SOURCE_KEY, JSON.stringify(['root', 'ghost-id']))
    setActivePinia(createPinia())
    seedSchemas()
    const store = useSuggestionScope()
    expect(store.isSelected('source', 'root')).toBe(true)
    expect(store.isSelected('source', 'ghost-id')).toBe(false)
  })

  it('auto-prunes stale ids when the source schema is replaced', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root')
    store.toggle('source', 'root-2')

    // Replace the source schema with one that only has 'root-2' as a root.
    const partial = buildSchema('Partial', [nodes[1]!])
    sourceSchemaResource.write({ schema: partial, sourceUrl: null })

    expect(store.isSelected('source', 'root')).toBe(false)
    expect(store.isSelected('source', 'root-2')).toBe(true)
  })

  it('auto-prunes target side independently from source', () => {
    const store = useSuggestionScope()
    store.toggle('target', 'root')
    store.toggle('target', 'root-2')

    targetSchemaResource.write({ schema: EMPTY_SCHEMA, sourceUrl: null })

    expect(store.hasTargetSelection).toBe(false)
    // Source selection is untouched.
    store.toggle('source', 'root')
    expect(store.isSelected('source', 'root')).toBe(true)
  })

  it('scopedSourceLeaves reflects selected source roots against the source schema', () => {
    const store = useSuggestionScope()
    store.toggle('source', 'root-2')
    expect(store.scopedSourceLeaves.map((f) => f.id)).toEqual(['leaf-3'])
  })

  it('scopedTargetLeaves reflects selected target roots against the target schema', () => {
    const store = useSuggestionScope()
    store.toggle('target', 'root')
    const ids = store.scopedTargetLeaves.map((f) => f.id).sort()
    expect(ids).toEqual(['leaf-1', 'leaf-2'])
  })
})
