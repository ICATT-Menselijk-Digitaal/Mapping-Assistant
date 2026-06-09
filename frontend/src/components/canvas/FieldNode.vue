<script setup lang="ts">
const props = defineProps<{
  data: {
    name: string
    dataType: string
    required: boolean
  }
  fieldId: string
  side: 'source' | 'target'
  selected?: boolean
}>()

const emit = defineEmits<{
  'field-click': [fieldId: string]
}>()

const FALLBACK_TYPE = { bg: 'bg-slate-100', text: 'text-slate-400', label: '?' }

const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  string: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'str' },
  number: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'num' },
  boolean: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'bool' },
  date: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'date' },
  object: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'obj' },
  array: { bg: 'bg-cyan-50', text: 'text-cyan-600', label: 'arr' },
  enum: { bg: 'bg-rose-50', text: 'text-rose-600', label: 'enum' },
  unknown: FALLBACK_TYPE,
}

const tc: { bg: string; text: string; label: string } =
  typeConfig[props.data.dataType] ?? FALLBACK_TYPE
</script>

<template>
  <div
    :data-field-id="fieldId"
    :data-field-side="side"
    :aria-selected="selected || undefined"
    :class="[
      'w-full flex items-center gap-2 py-2 pl-3 pr-3 border-b border-slate-100 text-sm transition-colors group cursor-pointer',
      selected ? 'bg-blue-50 ring-1 ring-blue-300 ring-inset' : 'hover:bg-slate-50',
    ]"
    :aria-label="`${props.data.name}, ${props.data.dataType}${props.data.required ? ', verplicht' : ''}`"
    @click="emit('field-click', fieldId)"
  >
    <!-- Left dot indicator -->
    <span
      :class="['shrink-0 w-1.5 h-1.5 rounded-full', selected ? 'bg-blue-400' : 'bg-slate-200']"
    />

    <!-- Field name (monospace) -->
    <span class="font-mono truncate flex-1 text-slate-800 font-medium text-[13px]">{{
      props.data.name
    }}</span>

    <!-- Type badge -->
    <span
      :class="[
        'text-[11px] leading-none px-1.5 py-0.5 rounded font-medium shrink-0',
        tc.bg,
        tc.text,
      ]"
    >
      {{ tc.label }}
    </span>

    <!-- Required badge -->
    <span
      v-if="props.data.required"
      data-testid="req-badge"
      class="text-[10px] leading-none px-1 py-0.5 rounded bg-red-50 text-red-600 font-bold shrink-0 tracking-wide"
      >REQ</span
    >
  </div>
</template>
