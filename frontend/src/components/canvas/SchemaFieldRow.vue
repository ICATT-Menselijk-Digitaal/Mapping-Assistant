<script setup lang="ts">
import { computed } from 'vue'
import type { SchemaField } from '@/types'
import type { Schema } from '@/domain/schema'
import { fieldTypeBadge } from '@/utils/fieldTypeBadge'
import { highlightHtml } from '@/utils/highlightSegments'

// Recursively renders one schema field row, and — when it has children —
// its own expandable subtree of SchemaFieldRow instances. Unlike the flat,
// two-level template this replaced, nesting depth is no longer capped: an
// object nested inside an object nested inside an array (etc.) can always
// be expanded one more level, because this component renders itself for
// each child rather than a parent template inlining exactly one level.
//
// All reactive state (search, filters, expand/collapse, descriptions,
// highlight/selection) stays owned by the schema panel — this component
// only reads it through the callback props below, so there is one source
// of truth regardless of how many levels deep a row sits.
const props = defineProps<{
  field: SchemaField
  schema: Schema
  side: 'source' | 'target'
  groupName: string
  // Immediate parent field id — absent for a root (group-level) field, so
  // this row's data-child-of-field can point one level up regardless of
  // depth (mirrors the anchor-fallback ConnectionLines.vue already reads).
  parentFieldId?: string
  searchQuery: string
  displayedChildrenOf: (fieldId: string) => SchemaField[]
  isFieldExpanded: (fieldId: string) => boolean
  toggleField: (fieldId: string) => void
  isFieldHighlighted: (fieldId: string) => boolean
  isFieldSelected: (fieldId: string) => boolean
  fieldRowClass: (fieldId: string) => string
  hasDescription: (field: SchemaField) => boolean
  isDescriptionOpen: (fieldId: string) => boolean
  toggleDescription: (field: SchemaField) => void
  onFieldClick: (fieldId: string) => void
  onHoverEnter: (fieldId: string) => void
  onHoverLeave: () => void
}>()

const hasChildren = computed(() => props.schema.childrenOf(props.field.id).length > 0)
const childOfAttr = computed(() =>
  props.parentFieldId ? `${props.side}:${props.parentFieldId}` : undefined,
)
</script>

<template>
  <!-- Field with expandable children -->
  <template v-if="hasChildren">
    <div
      class="w-full flex items-center gap-2 py-2 pl-3 pr-3 border-b border-slate-100 text-sm hover:bg-slate-50 transition-colors cursor-pointer"
      @click="toggleField(field.id)"
    >
      <button
        :data-testid="`field-toggle-${field.id}`"
        :data-anchor-field="`${side}:${field.id}`"
        :data-child-of-field="childOfAttr"
        :data-field-in-group="`${side}:${groupName}`"
        class="min-w-0 flex items-center gap-2 text-left cursor-pointer"
        @click.stop="toggleField(field.id)"
      >
        <span class="shrink-0 text-slate-400 text-xs">{{
          isFieldExpanded(field.id) ? '▾' : '▸'
        }}</span>
        <span
          class="font-mono truncate text-slate-800 font-medium text-[13px]"
          v-html="highlightHtml(field.name, searchQuery, 'bg-yellow-200 text-inherit rounded')"
        />
      </button>
      <button
        :data-testid="`field-description-toggle-${field.id}`"
        :disabled="!hasDescription(field)"
        :aria-expanded="isDescriptionOpen(field.id)"
        :aria-label="isDescriptionOpen(field.id) ? 'Verberg beschrijving' : 'Toon beschrijving'"
        :class="[
          'shrink-0 flex items-center',
          hasDescription(field)
            ? 'text-slate-400 hover:text-slate-600 cursor-pointer'
            : 'text-slate-200 cursor-not-allowed',
          isDescriptionOpen(field.id) ? 'text-indigo-500 hover:text-indigo-600' : '',
        ]"
        @click.stop="toggleDescription(field)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      <span class="flex-1" />
      <span
        :class="[
          'text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0',
          fieldTypeBadge(field.dataType).bg,
          fieldTypeBadge(field.dataType).text,
        ]"
      >
        {{ fieldTypeBadge(field.dataType).label }}
      </span>
      <span
        v-if="field.required"
        data-testid="req-badge"
        class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
        >REQ</span
      >
    </div>
    <p
      v-if="isDescriptionOpen(field.id) && hasDescription(field)"
      :data-testid="`field-description-${field.id}`"
      class="text-xs text-slate-600 break-words px-3 py-1.5 border-b border-slate-100 bg-slate-50"
    >
      {{ field.description }}
    </p>

    <!-- Children subtree -->
    <div
      v-show="isFieldExpanded(field.id)"
      :data-testid="`field-children-${field.id}`"
      class="pl-4 border-l border-slate-100 ml-3"
    >
      <SchemaFieldRow
        v-for="child in displayedChildrenOf(field.id)"
        :key="child.id"
        :field="child"
        :schema="schema"
        :side="side"
        :group-name="groupName"
        :parent-field-id="field.id"
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
  </template>

  <!-- Leaf field -->
  <template v-else>
    <div
      :data-field-id="field.id"
      :data-field-side="side"
      :data-child-of-field="childOfAttr"
      :data-field-in-group="`${side}:${groupName}`"
      :data-highlighted="isFieldHighlighted(field.id)"
      :data-selected="isFieldSelected(field.id)"
      :aria-selected="isFieldSelected(field.id) || undefined"
      :class="[
        'w-full flex items-center gap-2 py-2 pl-3 pr-1 border-b border-slate-100 text-sm cursor-pointer transition-colors',
        fieldRowClass(field.id),
      ]"
      @click="onFieldClick(field.id)"
      @mouseenter="onHoverEnter(field.id)"
      @mouseleave="onHoverLeave()"
    >
      <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-slate-200" />
      <span
        class="font-mono truncate min-w-0 text-slate-800 font-medium text-[13px]"
        v-html="highlightHtml(field.name, searchQuery, 'bg-yellow-200 text-inherit rounded')"
      />
      <button
        :data-testid="`field-description-toggle-${field.id}`"
        :disabled="!hasDescription(field)"
        :aria-expanded="isDescriptionOpen(field.id)"
        :aria-label="isDescriptionOpen(field.id) ? 'Verberg beschrijving' : 'Toon beschrijving'"
        :class="[
          'shrink-0 flex items-center',
          hasDescription(field)
            ? 'text-slate-400 hover:text-slate-600 cursor-pointer'
            : 'text-slate-200 cursor-not-allowed',
          isDescriptionOpen(field.id) ? 'text-indigo-500 hover:text-indigo-600' : '',
        ]"
        @click.stop="toggleDescription(field)"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      <span class="flex-1" />
      <span
        v-if="field.dataType === 'string' && field.maxLength != null"
        class="text-[10px] text-slate-400 shrink-0"
        >max {{ field.maxLength }}</span
      >
      <span
        :class="[
          'text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0',
          fieldTypeBadge(field.dataType).bg,
          fieldTypeBadge(field.dataType).text,
        ]"
      >
        {{ fieldTypeBadge(field.dataType).label }}
      </span>
      <span
        v-if="field.required"
        data-testid="req-badge"
        class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
        >REQ</span
      >
    </div>
    <p
      v-if="isDescriptionOpen(field.id) && hasDescription(field)"
      :data-testid="`field-description-${field.id}`"
      class="text-xs text-slate-600 break-words px-3 py-1.5 border-b border-slate-100 bg-slate-50"
    >
      {{ field.description }}
    </p>
  </template>
</template>
