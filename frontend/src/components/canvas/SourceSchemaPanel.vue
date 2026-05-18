<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { SchemaField } from '@/types'
import type { Schema } from '@/domain/schema'

const rootEl = ref<HTMLElement | null>(null)

const props = defineProps<{
  schema: Schema
  side?: 'source' | 'target'
}>()

const emit = defineEmits<{
  'field-click': [fieldId: string]
}>()

interface GroupEntry { name: string; fields: SchemaField[] }

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

const hasNamedGroups = computed(() => groups.value.some((g) => g.name !== ''))

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
  string:  { bg: 'bg-blue-50',    text: 'text-blue-600',   label: 'str'  },
  number:  { bg: 'bg-amber-50',   text: 'text-amber-600',  label: 'num'  },
  boolean: { bg: 'bg-purple-50',  text: 'text-purple-600', label: 'bool' },
  date:    { bg: 'bg-emerald-50', text: 'text-emerald-600',label: 'date' },
  object:  { bg: 'bg-slate-100',  text: 'text-slate-500',  label: 'obj'  },
  array:   { bg: 'bg-cyan-50',    text: 'text-cyan-600',   label: 'arr'  },
  unknown: FALLBACK_TYPE,
}

function tc(dataType: string) {
  return typeConfig[dataType] ?? FALLBACK_TYPE
}

async function scrollToField(fieldId: string): Promise<void> {
  const parent = props.schema.parentOf(fieldId)
  const topLevel = parent ?? props.schema.byId(fieldId)
  if (!topLevel) return

  const dot = topLevel.path.indexOf('.')
  const groupName = dot >= 0 ? topLevel.path.slice(0, dot) : ''
  groupCollapsed.value = { ...groupCollapsed.value, [groupName]: false }

  if (parent) {
    fieldCollapsed.value = { ...fieldCollapsed.value, [parent.id]: false }
  }

  await nextTick()
  rootEl.value
    ?.querySelector<HTMLElement>(`[data-field-id="${fieldId}"]`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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

    <!-- Schema groups -->
    <template v-else>
      <div
        v-for="group in groups"
        :key="group.name"
        :data-testid="hasNamedGroups ? `schema-group-${group.name}` : undefined"
      >
        <!-- Group header (only when named groups) -->
        <button
          v-if="hasNamedGroups"
          :data-testid="`schema-group-toggle-${group.name}`"
          :data-anchor-group="`${side}:${group.name}`"
          class="w-full flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-left text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
          @click="toggleGroup(group.name)"
        >
          <span class="text-slate-400">{{ isGroupExpanded(group.name) ? '▾' : '▸' }}</span>
          {{ group.name }}
        </button>

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
                <span class="shrink-0 text-slate-400 text-xs">{{ isFieldExpanded(field.id) ? '▾' : '▸' }}</span>
                <span class="font-mono truncate flex-1 text-slate-800 font-medium text-[13px]">{{ field.name }}</span>
                <span :class="['text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0', tc(field.dataType).bg, tc(field.dataType).text]">
                  {{ tc(field.dataType).label }}
                </span>
                <span
                  v-if="field.required"
                  data-testid="req-badge"
                  class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
                >REQ</span>
              </button>

              <!-- Children subtree -->
              <div
                v-show="isFieldExpanded(field.id)"
                :data-testid="`field-children-${field.id}`"
                class="pl-4 border-l border-slate-100 ml-3"
              >
                <div
                  v-for="child in schema.childrenOf(field.id)"
                  :key="child.id"
                  :data-field-id="child.id"
                  :data-field-side="side"
                  :data-child-of-field="`${side}:${field.id}`"
                  :data-field-in-group="`${side}:${group.name}`"
                  class="w-full flex items-center gap-2 py-2 pl-2 pr-3 border-b border-slate-100 text-sm cursor-pointer hover:bg-slate-50"
                  @click="emit('field-click', child.id)"
                >
                  <span class="font-mono truncate flex-1 text-slate-700 text-[13px]">{{ child.name }}</span>
                  <span :class="['text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0', tc(child.dataType).bg, tc(child.dataType).text]">
                    {{ tc(child.dataType).label }}
                  </span>
                  <span
                    v-if="child.required"
                    data-testid="req-badge"
                    class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
                  >REQ</span>
                  <span
                    v-if="child.dataType === 'string' && child.maxLength != null"
                    class="text-[10px] text-slate-400 shrink-0"
                  >max {{ child.maxLength }}</span>
                </div>
              </div>
            </template>

            <!-- Leaf field -->
            <div
              v-else
              :data-field-id="field.id"
              :data-field-side="side"
              :data-field-in-group="`${side}:${group.name}`"
              class="w-full flex items-center gap-2 py-2 pl-3 pr-3 border-b border-slate-100 text-sm cursor-pointer hover:bg-slate-50 transition-colors"
              @click="emit('field-click', field.id)"
            >
              <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-slate-200" />
              <span class="font-mono truncate flex-1 text-slate-800 font-medium text-[13px]">{{ field.name }}</span>
              <span
                v-if="field.dataType === 'string' && field.maxLength != null"
                class="text-[10px] text-slate-400 shrink-0"
              >max {{ field.maxLength }}</span>
              <span :class="['text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0', tc(field.dataType).bg, tc(field.dataType).text]">
                {{ tc(field.dataType).label }}
              </span>
              <span
                v-if="field.required"
                data-testid="req-badge"
                class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
              >REQ</span>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
