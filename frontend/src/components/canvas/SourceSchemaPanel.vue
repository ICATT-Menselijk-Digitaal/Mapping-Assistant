<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { SchemaField } from '@/types'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useSuggestionScope } from '@/composables/useSuggestionScope'
import { highlightHtml } from '@/utils/highlightSegments'

const rootEl = ref<HTMLElement | null>(null)

const props = defineProps<{
  schema: Schema
  side?: 'source' | 'target'
}>()

const emit = defineEmits<{
  'field-click': [fieldId: string]
}>()

const mappingsStore = useMappings()
const { mappings, hoveredFieldId, hoveredFieldSide } = storeToRefs(mappingsStore)
const scopeStore = useSuggestionScope()

const scopeSide = computed<'source' | 'target'>(() => props.side ?? 'source')

// Per Feature #89: only the source side is scope-selectable. Target is
// always fully included in AI calls, so no scope UI is rendered on it.
const scopeEnabled = computed(() => scopeSide.value === 'source')

watch(
  () => props.schema,
  (s) => {
    if (scopeEnabled.value) scopeStore.pruneAgainst(scopeSide.value, s)
  },
  { immediate: true },
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

// A field row is highlighted when it is directly hovered, or it is the
// mapped counterpart of the field currently hovered (in either panel —
// hoveredFieldId/hoveredFieldSide are shared store state). Source and
// target schemas are parsed independently and can share raw field ids, so
// every comparison must also check the hovered field's side — otherwise an
// unrelated same-named field on the other schema lights up too.
const highlightedFieldIds = computed(() => {
  const ids = new Set<string>()
  const hovered = hoveredFieldId.value
  const hoveredSide = hoveredFieldSide.value
  if (!hovered || !hoveredSide) return ids

  if (hoveredSide === scopeSide.value) {
    ids.add(hovered)
    return ids
  }

  for (const m of mappings.value) {
    const hoveredMatches =
      hoveredSide === 'source' ? m.sourceFieldId === hovered : m.targetFieldId === hovered
    if (hoveredMatches) {
      ids.add(scopeSide.value === 'source' ? m.sourceFieldId : m.targetFieldId)
    }
  }
  return ids
})

function isFieldHighlighted(fieldId: string): boolean {
  return highlightedFieldIds.value.has(fieldId)
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
  fieldCollapsed.value = { ...fieldCollapsed.value, [fieldId]: !fieldCollapsed.value[fieldId] }
  nextTick(() => window.dispatchEvent(new CustomEvent('schema-panel-toggle')))
}

function isFieldExpanded(fieldId: string) {
  return !fieldCollapsed.value[fieldId]
}

const FALLBACK_TYPE = { bg: 'bg-slate-100', text: 'text-slate-400', label: '?' }
const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  string: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'str' },
  number: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'num' },
  boolean: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'bool' },
  date: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'date' },
  object: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'obj' },
  array: { bg: 'bg-cyan-50', text: 'text-cyan-600', label: 'arr' },
  unknown: FALLBACK_TYPE,
}

function tc(dataType: string) {
  return typeConfig[dataType] ?? FALLBACK_TYPE
}

async function scrollToField(fieldId: string): Promise<void> {
  const path = props.schema.pathOf(fieldId)
  const topLevel = path[0]
  if (!topLevel) return

  const dot = topLevel.path.indexOf('.')
  const groupName = dot >= 0 ? topLevel.path.slice(0, dot) : ''
  groupCollapsed.value = { ...groupCollapsed.value, [groupName]: false }

  // Expand every ancestor along the full root→field chain, not just the
  // immediate parent — a no-op beyond one level at today's 2-level render
  // cap, but correct if the tree ever renders deeper.
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
          <template v-for="field in group.fields" :key="field.id">
            <!-- Field with expandable children -->
            <template v-if="schema.childrenOf(field.id).length > 0">
              <button
                :data-testid="`field-toggle-${field.id}`"
                :data-anchor-field="`${side}:${field.id}`"
                :data-field-in-group="`${side}:${group.name}`"
                class="w-full flex items-center gap-2 py-2 pl-3 pr-3 border-b border-slate-100 text-sm text-left hover:bg-slate-50 transition-colors cursor-pointer"
                @click="toggleField(field.id)"
              >
                <span class="shrink-0 text-slate-400 text-xs">{{
                  isFieldExpanded(field.id) ? '▾' : '▸'
                }}</span>
                <span
                  class="font-mono truncate flex-1 text-slate-800 font-medium text-[13px]"
                  v-html="
                    highlightHtml(field.name, searchQuery, 'bg-yellow-200 text-inherit rounded')
                  "
                />
                <span
                  :class="[
                    'text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0',
                    tc(field.dataType).bg,
                    tc(field.dataType).text,
                  ]"
                >
                  {{ tc(field.dataType).label }}
                </span>
                <span
                  v-if="field.required"
                  data-testid="req-badge"
                  class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
                  >REQ</span
                >
              </button>

              <!-- Children subtree -->
              <div
                v-show="isFieldExpanded(field.id)"
                :data-testid="`field-children-${field.id}`"
                class="pl-4 border-l border-slate-100 ml-3"
              >
                <div
                  v-for="child in displayedChildrenOf(field.id)"
                  :key="child.id"
                  :data-field-id="child.id"
                  :data-field-side="side"
                  :data-child-of-field="`${side}:${field.id}`"
                  :data-field-in-group="`${side}:${group.name}`"
                  :data-highlighted="isFieldHighlighted(child.id)"
                  :class="[
                    'w-full flex items-center gap-2 py-2 pl-2 pr-3 border-b border-slate-100 text-sm cursor-pointer',
                    isFieldHighlighted(child.id) ? 'bg-indigo-50' : 'hover:bg-slate-50',
                  ]"
                  @click="emit('field-click', child.id)"
                  @mouseenter="mappingsStore.hoverField(child.id, scopeSide)"
                  @mouseleave="mappingsStore.hoverField(null)"
                >
                  <span
                    class="font-mono truncate flex-1 text-slate-700 text-[13px]"
                    v-html="
                      highlightHtml(child.name, searchQuery, 'bg-yellow-200 text-inherit rounded')
                    "
                  />
                  <span
                    :class="[
                      'text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0',
                      tc(child.dataType).bg,
                      tc(child.dataType).text,
                    ]"
                  >
                    {{ tc(child.dataType).label }}
                  </span>
                  <span
                    v-if="child.required"
                    data-testid="req-badge"
                    class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
                    >REQ</span
                  >
                  <span
                    v-if="child.dataType === 'string' && child.maxLength != null"
                    class="text-[10px] text-slate-400 shrink-0"
                    >max {{ child.maxLength }}</span
                  >
                </div>
              </div>
            </template>

            <!-- Leaf field -->
            <div
              v-else
              :data-field-id="field.id"
              :data-field-side="side"
              :data-field-in-group="`${side}:${group.name}`"
              :data-highlighted="isFieldHighlighted(field.id)"
              :class="[
                'w-full flex items-center gap-2 py-2 pl-3 pr-3 border-b border-slate-100 text-sm cursor-pointer transition-colors',
                isFieldHighlighted(field.id) ? 'bg-indigo-50' : 'hover:bg-slate-50',
              ]"
              @click="emit('field-click', field.id)"
              @mouseenter="mappingsStore.hoverField(field.id, scopeSide)"
              @mouseleave="mappingsStore.hoverField(null)"
            >
              <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-slate-200" />
              <span
                class="font-mono truncate flex-1 text-slate-800 font-medium text-[13px]"
                v-html="
                  highlightHtml(field.name, searchQuery, 'bg-yellow-200 text-inherit rounded')
                "
              />
              <span
                v-if="field.dataType === 'string' && field.maxLength != null"
                class="text-[10px] text-slate-400 shrink-0"
                >max {{ field.maxLength }}</span
              >
              <span
                :class="[
                  'text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0',
                  tc(field.dataType).bg,
                  tc(field.dataType).text,
                ]"
              >
                {{ tc(field.dataType).label }}
              </span>
              <span
                v-if="field.required"
                data-testid="req-badge"
                class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
                >REQ</span
              >
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
