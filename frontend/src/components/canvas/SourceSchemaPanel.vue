<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { SchemaField } from '@/types'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useSuggestionScope } from '@/composables/useSuggestionScope'
import { useTargetScopeFlag } from '@/composables/useTargetScopeFlag'
import { highlightHtml } from '@/utils/highlightSegments'
import SchemaFieldRow from './SchemaFieldRow.vue'

const rootEl = ref<HTMLElement | null>(null)

const props = defineProps<{
  schema: Schema
  side?: 'source' | 'target'
  selectedFieldId?: string | null
}>()

const emit = defineEmits<{
  'field-click': [fieldId: string]
}>()

const mappingsStore = useMappings()
const { mappings, hoveredFieldId, hoveredFieldSide, hoveredMappingId } = storeToRefs(mappingsStore)
const scopeStore = useSuggestionScope()
const { targetScopeEnabled } = useTargetScopeFlag()

const scopeSide = computed<'source' | 'target'>(() => props.side ?? 'source')

// Per Feature #89: the source side is always scope-selectable. The target
// side is only scope-selectable behind the `?targetScope=1` test-mode flag
// (Feature #159) — otherwise it stays fully included in AI calls, matching
// #89's original AC.
const scopeEnabled = computed(
  () => scopeSide.value === 'source' || (scopeSide.value === 'target' && targetScopeEnabled.value),
)

const allRootsSelected = computed(() => {
  const roots = props.schema.roots
  return roots.length > 0 && roots.every((r) => scopeStore.isSelected(scopeSide.value, r.id))
})
function toggleSelectAllScope() {
  const roots = props.schema.roots
  const allSelected = allRootsSelected.value
  for (const r of roots) {
    const currently = scopeStore.isSelected(scopeSide.value, r.id)
    if (allSelected && currently) scopeStore.toggle(scopeSide.value, r.id)
    else if (!allSelected && !currently) scopeStore.toggle(scopeSide.value, r.id)
  }
}

function isGroupSelected(rootIds: readonly string[]): boolean {
  return rootIds.length > 0 && rootIds.every((id) => scopeStore.isSelected(scopeSide.value, id))
}
function toggleGroupScope(rootIds: readonly string[]) {
  const allSelected = isGroupSelected(rootIds)
  for (const id of rootIds) {
    const currently = scopeStore.isSelected(scopeSide.value, id)
    if (allSelected && currently) scopeStore.toggle(scopeSide.value, id)
    else if (!allSelected && !currently) scopeStore.toggle(scopeSide.value, id)
  }
}

const searchQuery = ref('')
const filterStatus = ref<'all' | 'mapped' | 'unmapped'>('all')

const mappedFieldIds = computed(() => {
  const ids = new Set<string>()
  for (const m of mappings.value) {
    ids.add(m.sourceFieldId)
    ids.add(m.targetFieldId)
  }
  return ids
})

// A field row is highlighted when it is directly hovered, when it is the
// mapped counterpart of the field currently hovered (in either panel —
// hoveredFieldId/hoveredFieldSide are shared store state), or when its
// mapping's connection line is hovered directly (hoveredMappingId) — hovering
// the line highlights both ends, mirroring hovering a field highlighting the
// line. Source and target schemas are parsed independently and can share raw
// field ids, so every field-hover comparison must also check the hovered
// field's side — otherwise an unrelated same-named field on the other schema
// lights up too.
const highlightedFieldIds = computed(() => {
  const ids = new Set<string>()

  const hoveredMapping = hoveredMappingId.value
  if (hoveredMapping) {
    const m = mappings.value.find((m) => m.id === hoveredMapping)
    if (m) ids.add(scopeSide.value === 'source' ? m.sourceFieldId : m.targetFieldId)
  }

  const hovered = hoveredFieldId.value
  const hoveredSide = hoveredFieldSide.value
  if (hovered && hoveredSide) {
    if (hoveredSide === scopeSide.value) {
      ids.add(hovered)
    } else {
      for (const m of mappings.value) {
        const hoveredMatches =
          hoveredSide === 'source' ? m.sourceFieldId === hovered : m.targetFieldId === hovered
        if (hoveredMatches) {
          ids.add(scopeSide.value === 'source' ? m.sourceFieldId : m.targetFieldId)
        }
      }
    }
  }

  return ids
})

function isFieldHighlighted(fieldId: string): boolean {
  return highlightedFieldIds.value.has(fieldId)
}

function onFieldClick(fieldId: string): void {
  emit('field-click', fieldId)
}
function onHoverEnter(fieldId: string): void {
  mappingsStore.hoverField(fieldId, scopeSide.value)
}
function onHoverLeave(): void {
  mappingsStore.hoverField(null)
}

// The field currently used to start a manual mapping (source-first
// click-to-map). Distinct from isFieldHighlighted (hover) — a field can be
// selected and highlighted at the same time, so selected wins visually.
function isFieldSelected(fieldId: string): boolean {
  return fieldId === props.selectedFieldId
}

function fieldRowClass(fieldId: string): string {
  if (isFieldSelected(fieldId)) return 'bg-blue-50 ring-1 ring-blue-300 ring-inset'
  if (isFieldHighlighted(fieldId)) return 'bg-indigo-100'
  return 'hover:bg-slate-50'
}

function fieldMatchesName(field: SchemaField): boolean {
  if (!searchQuery.value) return true
  return field.name.toLowerCase().includes(searchQuery.value.toLowerCase())
}

function fieldMatchesStatus(fieldId: string): boolean {
  if (filterStatus.value === 'all') return true
  const mapped = mappedFieldIds.value.has(fieldId)
  return filterStatus.value === 'mapped' ? mapped : !mapped
}

function displayedChildrenOf(fieldId: string): SchemaField[] {
  const parent = props.schema.byId(fieldId)
  const parentDirectMatch = parent != null && fieldMatchesName(parent)
  return props.schema
    .childrenOf(fieldId)
    .filter((child) =>
      parentDirectMatch
        ? fieldMatchesStatus(child.id)
        : fieldMatchesName(child) && fieldMatchesStatus(child.id),
    )
}

function hasMatchingChildren(fieldId: string): boolean {
  if (!isFilterActive.value) return false
  return props.schema
    .childrenOf(fieldId)
    .some((child) => fieldMatchesName(child) && fieldMatchesStatus(child.id))
}

interface GroupEntry {
  name: string
  fields: SchemaField[]
}

const groups = computed<GroupEntry[]>(() => {
  const map = new Map<string, SchemaField[]>()
  for (const f of props.schema.roots) {
    const dot = f.path.indexOf('.')
    const group = dot >= 0 ? f.path.slice(0, dot) : ''
    if (!map.has(group)) map.set(group, [])
    map.get(group)!.push(f)
  }
  return [...map.entries()].map(([name, fields]) => ({ name, fields }))
})

const displayedGroups = computed<GroupEntry[]>(() => {
  if (!searchQuery.value && filterStatus.value === 'all') return groups.value
  return groups.value
    .map((g) => {
      const groupNameMatches =
        !!searchQuery.value &&
        !!g.name &&
        g.name.toLowerCase().includes(searchQuery.value.toLowerCase())
      return {
        ...g,
        fields: g.fields.filter((f) => {
          if (groupNameMatches) return fieldMatchesStatus(f.id)
          const hasChildren = props.schema.childrenOf(f.id).length > 0
          return hasChildren
            ? (fieldMatchesName(f) && fieldMatchesStatus(f.id)) ||
                displayedChildrenOf(f.id).length > 0
            : fieldMatchesName(f) && fieldMatchesStatus(f.id)
        }),
      }
    })
    .filter((g) => g.fields.length > 0)
})

const hasNamedGroups = computed(() => groups.value.some((g) => g.name !== ''))
const isFilterActive = computed(() => !!searchQuery.value || filterStatus.value !== 'all')

watch(
  [searchQuery, filterStatus],
  () => {
    if (isFilterActive.value) {
      for (const g of displayedGroups.value) {
        groupCollapsed.value = { ...groupCollapsed.value, [g.name]: false }
      }
      for (const f of props.schema.roots) {
        if (props.schema.childrenOf(f.id).length > 0 && hasMatchingChildren(f.id)) {
          fieldCollapsed.value = { ...fieldCollapsed.value, [f.id]: false }
        }
      }
    } else {
      groupCollapsed.value = Object.fromEntries(groups.value.map((g) => [g.name, true]))
      fieldCollapsed.value = Object.fromEntries(
        props.schema.roots
          .filter((f) => props.schema.childrenOf(f.id).length > 0)
          .map((f) => {
            const hasMappedChild = props.schema
              .childrenOf(f.id)
              .some((c) => mappedFieldIds.value.has(c.id))
            return [f.id, !hasMappedChild]
          }),
      )
    }
  },
  { flush: 'sync' },
)

watch([searchQuery, filterStatus], () => {
  nextTick(() => window.dispatchEvent(new CustomEvent('schema-panel-toggle')))
})

// all groups and fields with children start collapsed
const groupCollapsed = ref<Record<string, boolean>>(
  Object.fromEntries(groups.value.map((g) => [g.name, true])),
)
const fieldCollapsed = ref<Record<string, boolean>>(
  Object.fromEntries(
    props.schema.roots
      .filter((f) => props.schema.childrenOf(f.id).length > 0)
      .map((f) => [f.id, true]),
  ),
)

function toggleGroup(name: string) {
  groupCollapsed.value = { ...groupCollapsed.value, [name]: !groupCollapsed.value[name] }
  nextTick(() => window.dispatchEvent(new CustomEvent('schema-panel-toggle')))
}

function isGroupExpanded(name: string) {
  return !groupCollapsed.value[name]
}

function toggleField(fieldId: string) {
  const willCollapse = isFieldExpanded(fieldId)
  fieldCollapsed.value = { ...fieldCollapsed.value, [fieldId]: willCollapse }
  if (willCollapse) {
    // Prevent a stale "open" description on a child from resurfacing when its
    // parent is expanded again — Feature #133 edge case.
    const next = { ...openDescriptions.value }
    let touched = false
    for (const child of props.schema.childrenOf(fieldId)) {
      if (next[child.id]) {
        delete next[child.id]
        touched = true
      }
    }
    if (touched) openDescriptions.value = next
  }
  nextTick(() => window.dispatchEvent(new CustomEvent('schema-panel-toggle')))
}

// A field only counts as expanded once explicitly toggled to `false` — not
// merely "not marked collapsed". Root fields get an initial `true` entry
// below, but a field nested 2+ levels deep (only reachable once its own
// parent is expanded, so it was never eligible for that initial pass) has
// no entry at all until its own first toggle. Treating that as expanded by
// default (the old `!fieldCollapsed.value[fieldId]` did, since
// `!undefined` is `true`) would make every such field start open instead of
// collapsed like everything else.
function isFieldExpanded(fieldId: string) {
  return fieldCollapsed.value[fieldId] === false
}

const openDescriptions = ref<Record<string, boolean>>({})

function hasDescription(field: SchemaField): boolean {
  const desc = field.description?.trim()
  if (!desc) return false
  // A description that just echoes the field's own name adds no information
  // over what the row already shows — treat it as absent.
  return desc.toLowerCase() !== field.name.trim().toLowerCase()
}

function isDescriptionOpen(fieldId: string): boolean {
  return !!openDescriptions.value[fieldId]
}

function toggleDescription(field: SchemaField) {
  if (!hasDescription(field)) return
  openDescriptions.value = {
    ...openDescriptions.value,
    [field.id]: !openDescriptions.value[field.id],
  }
  nextTick(() => window.dispatchEvent(new CustomEvent('schema-panel-toggle')))
}

async function scrollToField(fieldId: string): Promise<void> {
  const path = props.schema.pathOf(fieldId)
  const topLevel = path[0]
  if (!topLevel) return

  const dot = topLevel.path.indexOf('.')
  const groupName = dot >= 0 ? topLevel.path.slice(0, dot) : ''
  groupCollapsed.value = { ...groupCollapsed.value, [groupName]: false }

  // Expand every ancestor along the full root→field chain, not just the
  // immediate parent — the tree renders arbitrarily deep (SchemaFieldRow),
  // so a field several objects deep needs every ancestor opened to reach it.
  const ancestors = path.slice(0, -1)
  if (ancestors.length > 0) {
    const expanded = Object.fromEntries(ancestors.map((a) => [a.id, false]))
    fieldCollapsed.value = { ...fieldCollapsed.value, ...expanded }
  }

  await nextTick()
  rootEl.value
    ?.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

defineExpose({ scrollToField })
</script>

<template>
  <div ref="rootEl" class="flex flex-col h-full overflow-y-auto">
    <!-- Empty state -->
    <div
      v-if="schema.roots.length === 0"
      data-testid="empty-state"
      class="flex-1 flex items-center justify-center p-6 text-sm text-slate-400 text-center"
    >
      Laad een bronschema om de velden te bekijken
    </div>

    <!-- Filter bar -->
    <template v-else>
      <div
        class="sticky top-0 z-10 bg-white px-3 py-2 border-b border-slate-100 flex flex-col gap-1.5"
      >
        <div class="relative">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Zoek op veldnaam…"
            :aria-label="side === 'target' ? 'Zoek doelvelden' : 'Zoek bronvelden'"
            data-testid="search-input"
            class="w-full text-xs border border-slate-200 rounded px-2 py-1.5 pr-6 focus:outline-none focus:border-indigo-400"
          />
          <button
            v-if="searchQuery"
            aria-label="Zoekopdracht wissen"
            data-testid="search-clear"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 leading-none"
            @click="searchQuery = ''"
          >
            ×
          </button>
        </div>
        <div role="group" class="flex gap-1">
          <button
            :class="[
              'flex-1 text-[11px] px-2 py-1 rounded border transition-colors',
              filterStatus === 'all'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700',
            ]"
            data-testid="filter-all"
            @click="filterStatus = 'all'"
          >
            Alle
          </button>
          <button
            :class="[
              'flex-1 text-[11px] px-2 py-1 rounded border transition-colors',
              filterStatus === 'mapped'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700',
            ]"
            data-testid="filter-mapped"
            @click="filterStatus = 'mapped'"
          >
            Gekoppeld
          </button>
          <button
            :class="[
              'flex-1 text-[11px] px-2 py-1 rounded border transition-colors',
              filterStatus === 'unmapped'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700',
            ]"
            data-testid="filter-unmapped"
            @click="filterStatus = 'unmapped'"
          >
            Niet gekoppeld
          </button>
        </div>
        <button
          v-if="scopeEnabled"
          :data-testid="`scope-select-all-${side}`"
          class="text-[11px] px-2 py-1 rounded border bg-white text-slate-500 border-slate-200 hover:text-slate-700 transition-colors"
          @click="toggleSelectAllScope"
        >
          {{ allRootsSelected ? 'Deselecteer alles (bereik)' : 'Selecteer alles (bereik)' }}
        </button>
      </div>

      <!-- No-results state -->
      <div
        v-if="displayedGroups.length === 0"
        data-testid="no-results"
        class="flex-1 flex items-center justify-center p-6 text-sm text-slate-400 text-center"
      >
        Geen velden gevonden<template v-if="searchQuery"> voor "{{ searchQuery }}"</template>
      </div>
    </template>

    <!-- Schema groups -->
    <template v-if="schema.roots.length > 0 && displayedGroups.length > 0">
      <div
        v-for="group in displayedGroups"
        :key="group.name"
        :data-testid="hasNamedGroups ? `schema-group-${group.name}` : undefined"
      >
        <!-- Group header (only when named groups) -->
        <div
          v-if="hasNamedGroups"
          class="w-full flex items-center bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <button
            :data-testid="`schema-group-toggle-${group.name}`"
            :data-anchor-group="`${side}:${group.name}`"
            class="flex-1 flex items-center gap-2 px-3 py-1.5 text-left"
            @click="toggleGroup(group.name)"
          >
            <span class="text-slate-400">{{ isGroupExpanded(group.name) ? '▾' : '▸' }}</span>
            <span
              v-html="
                highlightHtml(
                  group.name,
                  searchQuery,
                  'bg-yellow-200 text-inherit rounded font-semibold',
                )
              "
            />
          </button>
          <label
            v-if="scopeEnabled"
            class="shrink-0 pr-3 pl-2 flex items-center cursor-pointer"
            :title="`Bereik: ${group.name}`"
            @click.stop
          >
            <input
              type="checkbox"
              :data-testid="`scope-checkbox-${side}-${group.name}`"
              :checked="isGroupSelected(group.fields.map((f) => f.id))"
              @change="toggleGroupScope(group.fields.map((f) => f.id))"
            />
          </label>
        </div>

        <!-- Group fields -->
        <div
          v-show="!hasNamedGroups || isGroupExpanded(group.name)"
          :data-testid="hasNamedGroups ? `schema-group-fields-${group.name}` : undefined"
        >
          <SchemaFieldRow
            v-for="field in group.fields"
            :key="field.id"
            :field="field"
            :schema="schema"
            :side="scopeSide"
            :group-name="group.name"
            :search-query="searchQuery"
            :displayed-children-of="displayedChildrenOf"
            :is-field-expanded="isFieldExpanded"
            :toggle-field="toggleField"
            :is-field-highlighted="isFieldHighlighted"
            :is-field-selected="isFieldSelected"
            :field-row-class="fieldRowClass"
            :has-description="hasDescription"
            :is-description-open="isDescriptionOpen"
            :toggle-description="toggleDescription"
            :on-field-click="onFieldClick"
            :on-hover-enter="onHoverEnter"
            :on-hover-leave="onHoverLeave"
          />
        </div>
      </div>
    </template>
  </div>
</template>
