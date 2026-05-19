<script setup lang="ts">
import type { MismatchType } from '@/types/mapping'

const props = defineProps<{
  type: MismatchType
  resolved: boolean
  manuallyResolved: boolean
  label: string
}>()

const emit = defineEmits<{
  solve: []
  'toggle-manual-resolution': []
}>()
</script>

<template>
  <div
    class="flex items-center justify-between px-3 py-2 border border-slate-200 rounded"
    :data-testid="`mismatch-card-${props.type}`"
  >
    <div class="flex items-center gap-2 min-w-0">
      <span
        :class="props.resolved || props.manuallyResolved ? 'text-emerald-600' : 'text-amber-600'"
        class="text-[10px] font-medium shrink-0"
        :data-testid="`mismatch-status-${props.type}`"
      >{{ props.resolved || props.manuallyResolved ? '✓ Opgelost' : '● Vereist' }}</span>
      <span class="text-xs text-slate-700 truncate">{{ props.label }}</span>
    </div>
    <div class="flex items-center gap-2 shrink-0 ml-2">
      <!-- Oplossen only when unresolved (no rule, not manually resolved) -->
      <button
        v-if="!props.resolved && !props.manuallyResolved"
        class="text-xs text-blue-600 hover:text-blue-800 underline"
        :data-testid="`mismatch-solve-${props.type}`"
        @click="emit('solve')"
      >Oplossen</button>
      <!-- Manual toggle: hidden when auto-resolved by rule -->
      <button
        v-if="!props.resolved && !props.manuallyResolved"
        class="text-xs text-slate-500 hover:text-slate-700 underline"
        :aria-label="`Markeer mismatch als handmatig opgelost`"
        :aria-pressed="false"
        :data-testid="`mismatch-mark-resolved-${props.type}`"
        @click="emit('toggle-manual-resolution')"
      >Markeer als opgelost</button>
      <button
        v-if="!props.resolved && props.manuallyResolved"
        class="text-xs text-slate-500 hover:text-slate-700 underline"
        :aria-label="`Markeer mismatch als niet opgelost`"
        :aria-pressed="true"
        :data-testid="`mismatch-mark-unresolved-${props.type}`"
        @click="emit('toggle-manual-resolution')"
      >Markeer als onopgelost</button>
    </div>
  </div>
</template>
