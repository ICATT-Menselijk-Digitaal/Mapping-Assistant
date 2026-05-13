<script setup lang="ts">
import type { MismatchType } from '@/types/mapping'

const props = defineProps<{
  type: MismatchType
  resolved: boolean
  label: string
}>()

const emit = defineEmits<{ solve: [] }>()
</script>

<template>
  <div
    class="flex items-center justify-between px-3 py-2 border border-slate-200 rounded"
    :data-testid="`mismatch-card-${props.type}`"
  >
    <div class="flex items-center gap-2 min-w-0">
      <span
        :class="props.resolved ? 'text-emerald-600' : 'text-amber-600'"
        class="text-[10px] font-medium shrink-0"
        :data-testid="`mismatch-status-${props.type}`"
      >{{ props.resolved ? '✓ Opgelost' : '● Vereist' }}</span>
      <span class="text-xs text-slate-700 truncate">{{ props.label }}</span>
    </div>
    <button
      v-if="!props.resolved"
      class="text-xs text-blue-600 hover:text-blue-800 shrink-0 ml-2 underline"
      :data-testid="`mismatch-solve-${props.type}`"
      @click="emit('solve')"
    >Oplossen</button>
  </div>
</template>
