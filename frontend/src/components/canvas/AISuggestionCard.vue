<script setup lang="ts">
import { ref } from 'vue'

withDefaults(
  defineProps<{
    suggestionId: string
    sourceName: string
    targetName: string
    confidenceScore: number
    reasoning?: string
    interactive?: boolean
    traced?: boolean
  }>(),
  { interactive: true, traced: false },
)

const emit = defineEmits<{
  accept: [id: string]
  reject: [id: string]
  trace: [id: string]
}>()

const expanded = ref(false)

function badge(score: number) {
  if (score >= 0.8) return { label: 'Hoog', cls: 'bg-green-100 text-green-700' }
  if (score >= 0.5) return { label: 'Middel', cls: 'bg-amber-100 text-amber-700' }
  return { label: 'Laag', cls: 'bg-red-100 text-red-600' }
}
</script>

<template>
  <div
    class="border-l-2 border-[--color-source] bg-white border border-slate-200 rounded px-3 py-2.5 flex flex-col gap-2 cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors"
    :class="traced ? 'ring-2 ring-indigo-400 bg-slate-50' : ''"
    :data-traced="traced"
    role="button"
    tabindex="0"
    data-testid="suggestion-card"
    @click="emit('trace', suggestionId)"
    @keydown.enter.prevent="emit('trace', suggestionId)"
    @keydown.space.prevent="emit('trace', suggestionId)"
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
    <div v-if="reasoning">
      <button
        class="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        data-testid="toelichting-toggle"
        @click.stop="expanded = !expanded"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-3 h-3 transition-transform"
          :class="expanded ? 'rotate-90' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
        Toelichting
      </button>
      <p
        v-if="expanded"
        class="text-xs text-slate-600 break-words mt-1"
        data-testid="toelichting-text"
      >
        {{ reasoning }}
      </p>
    </div>
    <div v-if="interactive" class="flex gap-2">
      <button
        class="flex-1 px-3 py-1 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
        data-testid="accept-button"
        @click.stop="emit('accept', suggestionId)"
      >
        Accepteer
      </button>
      <button
        class="flex-1 px-3 py-1 text-xs font-medium border border-slate-300 text-slate-600 hover:bg-slate-50 rounded transition-colors"
        data-testid="reject-button"
        @click.stop="emit('reject', suggestionId)"
      >
        Afwijzen
      </button>
    </div>
  </div>
</template>
