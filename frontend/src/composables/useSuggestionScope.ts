import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Schema } from '@/domain/schema'
import type { SchemaField } from '@/types'

export type ScopeSide = 'source' | 'target'

const STORAGE_KEYS: Record<ScopeSide, string> = {
  source: 'ma_suggestion_scope_source_root_ids',
  target: 'ma_suggestion_scope_target_root_ids',
}

function readStored(side: ScopeSide): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS[side])
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeStored(side: ScopeSide, ids: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS[side], JSON.stringify(ids))
  } catch {
    // localStorage unavailable — best-effort persistence
  }
}

export function leavesUnder(schema: Schema, rootIds: Iterable<string>): SchemaField[] {
  const ids = new Set(rootIds)
  if (ids.size === 0) return []
  const out: SchemaField[] = []
  const seen = new Set<string>()
  function collect(fieldId: string) {
    if (seen.has(fieldId)) return
    seen.add(fieldId)
    const children = schema.childrenOf(fieldId)
    if (children.length === 0) {
      const f = schema.byId(fieldId)
      if (f) out.push(f)
      return
    }
    for (const child of children) collect(child.id)
  }
  for (const id of ids) collect(id)
  return out
}

export const useSuggestionScope = defineStore('suggestionScope', () => {
  const selectedSourceRootIds = ref<Set<string>>(new Set(readStored('source')))
  const selectedTargetRootIds = ref<Set<string>>(new Set(readStored('target')))

  watch(selectedSourceRootIds, (set) => writeStored('source', [...set]), { flush: 'sync' })
  watch(selectedTargetRootIds, (set) => writeStored('target', [...set]), { flush: 'sync' })

  function ref_(side: ScopeSide) {
    return side === 'source' ? selectedSourceRootIds : selectedTargetRootIds
  }

  const hasSourceSelection = computed(() => selectedSourceRootIds.value.size > 0)
  const hasTargetSelection = computed(() => selectedTargetRootIds.value.size > 0)

  function isSelected(side: ScopeSide, rootId: string): boolean {
    return ref_(side).value.has(rootId)
  }

  function toggle(side: ScopeSide, rootId: string): void {
    const target = ref_(side)
    const next = new Set(target.value)
    if (next.has(rootId)) next.delete(rootId)
    else next.add(rootId)
    target.value = next
  }

  function clear(side: ScopeSide): void {
    ref_(side).value = new Set()
  }

  function pruneAgainst(side: ScopeSide, schema: Schema): void {
    const valid = new Set(schema.roots.map((f) => f.id))
    const target = ref_(side)
    const filtered = [...target.value].filter((id) => valid.has(id))
    if (filtered.length !== target.value.size) {
      target.value = new Set(filtered)
    }
  }

  function scopedLeaves(side: ScopeSide, schema: Schema): SchemaField[] {
    return leavesUnder(schema, ref_(side).value)
  }

  return {
    selectedSourceRootIds,
    selectedTargetRootIds,
    hasSourceSelection,
    hasTargetSelection,
    isSelected,
    toggle,
    clear,
    pruneAgainst,
    scopedLeaves,
  }
})
