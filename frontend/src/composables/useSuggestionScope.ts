import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Schema } from '@/domain/schema'
import type { SchemaField } from '@/types'

const STORAGE_KEY = 'ma_suggestion_scope_source_container_ids'

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function writeStored(ids: readonly string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // localStorage unavailable — best-effort persistence
  }
}

export function isContainer(field: SchemaField): boolean {
  return field.dataType === 'object' || field.dataType === 'array'
}

export function listContainers(schema: Schema): readonly SchemaField[] {
  return schema.all().filter((f) => isContainer(f) && schema.childrenOf(f.id).length > 0)
}

export function leavesUnder(schema: Schema, containerIds: Iterable<string>): SchemaField[] {
  const ids = new Set(containerIds)
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
  const selectedSourceContainerIds = ref<Set<string>>(new Set(readStored()))

  watch(selectedSourceContainerIds, (set) => writeStored([...set]), { flush: 'sync' })

  const hasSelection = computed(() => selectedSourceContainerIds.value.size > 0)

  function isSelected(containerId: string): boolean {
    return selectedSourceContainerIds.value.has(containerId)
  }

  function toggle(containerId: string): void {
    const next = new Set(selectedSourceContainerIds.value)
    if (next.has(containerId)) next.delete(containerId)
    else next.add(containerId)
    selectedSourceContainerIds.value = next
  }

  function selectAll(schema: Schema): void {
    selectedSourceContainerIds.value = new Set(listContainers(schema).map((f) => f.id))
  }

  function clear(): void {
    selectedSourceContainerIds.value = new Set()
  }

  function pruneAgainst(schema: Schema): void {
    const valid = new Set(listContainers(schema).map((f) => f.id))
    const filtered = [...selectedSourceContainerIds.value].filter((id) => valid.has(id))
    if (filtered.length !== selectedSourceContainerIds.value.size) {
      selectedSourceContainerIds.value = new Set(filtered)
    }
  }

  function scopedSourceLeaves(schema: Schema): SchemaField[] {
    return leavesUnder(schema, selectedSourceContainerIds.value)
  }

  return {
    selectedSourceContainerIds,
    hasSelection,
    isSelected,
    toggle,
    selectAll,
    clear,
    pruneAgainst,
    scopedSourceLeaves,
  }
})
