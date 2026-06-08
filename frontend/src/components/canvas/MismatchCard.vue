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
    class="px-3 py-2 border border-slate-200 rounded"
    :data-testid="`mismatch-card-${props.type}`"
  >
    <div class="flex items-baseline gap-2">
      <!-- Status badge pinned to the left -->
      <span
        :class="props.resolved || props.manuallyResolved ? 'text-emerald-600' : 'text-amber-600'"
        class="text-[10px] font-medium shrink-0"
        :data-testid="`mismatch-status-${props.type}`"
      >{{ props.resolved || props.manuallyResolved ? '✓ Opgelost' : '● Vereist' }}</span>
      <!-- Right column: label + buttons indented together -->
      <div class="min-w-0 flex-1">
        <span class="text-xs text-slate-700">{{ props.label }}</span>
        <div v-if="!props.resolved" class="flex items-center gap-1.5 mt-1.5">
          <button
            v-if="!props.manuallyResolved"
            class="inline-flex items-center h-6 text-xs text-blue-600 border border-blue-300 rounded px-2 hover:bg-blue-50 transition-colors"
            :data-testid="`mismatch-solve-${props.type}`"
            @click="emit('solve')"
          >Oplossen</button>
          <span v-if="!props.manuallyResolved" class="relative group inline-flex">
            <button
              class="inline-flex items-center h-6 text-xs text-slate-500 border border-slate-300 rounded px-2 hover:bg-slate-50 transition-colors"
              :aria-label="`Markeer mismatch als handmatig opgelost`"
              :aria-pressed="false"
              :data-testid="`mismatch-mark-resolved-${props.type}`"
              @click="emit('toggle-manual-resolution')"
            >✓</button>
            <span class="pointer-events-none absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white invisible group-hover:visible">
              Markeer als opgelost
            </span>
          </span>
          <span v-if="props.manuallyResolved" class="relative group inline-flex">
            <button
              class="inline-flex items-center h-6 text-xs text-slate-500 border border-slate-300 rounded px-2 hover:bg-slate-50 transition-colors"
              :aria-label="`Markeer mismatch als niet opgelost`"
              :aria-pressed="true"
              :data-testid="`mismatch-mark-unresolved-${props.type}`"
              @click="emit('toggle-manual-resolution')"
            >↩</button>
            <span class="pointer-events-none absolute bottom-full left-0 mb-1 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white invisible group-hover:visible">
              Markeer als onopgelost
            </span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
