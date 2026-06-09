<script setup lang="ts">
const props = defineProps<{
  data: {
    label: string
    side: 'source' | 'target'
  }
  counter?: { mapped: number; total: number }
}>()
</script>

<template>
  <div
    class="px-4 py-2.5 border-b border-slate-200 flex items-center gap-2.5 sticky top-0 z-10 bg-white"
    :class="props.data.side === 'source' ? 'bg-blue-50/30' : 'bg-emerald-50/30'"
  >
    <!-- Color dot -->
    <div
      class="h-6 w-6 rounded-md flex items-center justify-center shrink-0 text-[11px] font-bold"
      :class="
        props.data.side === 'source'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-emerald-100 text-emerald-700'
      "
    >
      {{ props.data.side === 'source' ? 'B' : 'D' }}
    </div>

    <!-- System name -->
    <h2
      class="text-sm font-bold tracking-tight truncate"
      :class="props.data.side === 'source' ? 'text-blue-800' : 'text-emerald-800'"
    >
      {{ props.data.label }}
    </h2>

    <!-- Side badge -->
    <span
      class="text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-widest uppercase shrink-0"
      :class="
        props.data.side === 'source'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-emerald-100 text-emerald-700'
      "
    >
      {{ props.data.side === 'source' ? 'Bron' : 'Doel' }}
    </span>

    <!-- Coverage counter -->
    <span
      v-if="counter && counter.total > 0"
      class="ml-auto text-[11px] text-slate-400 shrink-0"
      data-testid="coverage-counter"
    >
      {{ counter.mapped }} van {{ counter.total }}
      {{ props.data.side === 'source' ? 'bronvelden' : 'doelvelden' }}
      gekoppeld
    </span>
  </div>
</template>
