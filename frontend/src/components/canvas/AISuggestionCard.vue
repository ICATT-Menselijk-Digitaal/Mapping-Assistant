<script setup lang="ts">
withDefaults(
  defineProps<{
    suggestionId: string
    sourceName: string
    targetName: string
    confidenceScore: number
    interactive?: boolean
  }>(),
  { interactive: true },
)

const emit = defineEmits<{
  accept: [id: string]
  reject: [id: string]
}>()

function badge(score: number) {
  if (score >= 0.8) return { label: 'Hoog', cls: 'bg-green-100 text-green-700' }
  if (score >= 0.5) return { label: 'Middel', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Laag', cls: 'bg-red-100 text-red-600' }
}
</script>

<template>
  <div
    class="border-l-2 border-[--color-source] bg-white border border-slate-200 rounded px-3 py-2.5 flex flex-col gap-2"
    data-testid="suggestion-card"
  >
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <div class="flex items-center gap-1.5 text-[13px] font-mono min-w-0 flex-1">
        <span class="text-[--color-source] break-all">{{ sourceName }}</span>
        <span class="text-slate-400 shrink-0">→</span>
        <span class="text-[--color-destination] break-all">{{ targetName }}</span>
      </div>
      <span
        :class="[
          'shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded',
          badge(confidenceScore).cls,
        ]"
        data-testid="confidence-badge"
      >
        {{ badge(confidenceScore).label }} · {{ Math.round(confidenceScore * 100) }}%
      </span>
    </div>
    <div v-if="interactive" class="flex gap-2">
      <button
        class="flex-1 px-3 py-1 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
        data-testid="accept-button"
        @click="emit('accept', suggestionId)"
      >
        Accepteer
      </button>
      <button
        class="flex-1 px-3 py-1 text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 rounded transition-colors"
        data-testid="reject-button"
        @click="emit('reject', suggestionId)"
      >
        Afwijzen
      </button>
    </div>
  </div>
</template>
