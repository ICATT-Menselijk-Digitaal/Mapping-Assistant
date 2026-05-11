<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Schema } from '@/domain/schema'
import { useAISuggestions } from '@/composables/useAISuggestions'
import { useMappings } from '@/composables/useMappings'
import AISuggestionCard from './AISuggestionCard.vue'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
}>()

const aiStore = useAISuggestions()
const mappingsStore = useMappings()

const mappedSourceIds = computed(() => new Set(mappingsStore.mappings.map((m) => m.sourceFieldId)))
const mappedTargetIds = computed(() => new Set(mappingsStore.mappings.map((m) => m.targetFieldId)))

// Capped to Zaak context only to control prompt size and cost during PoC
const zaakSourceFields = computed(() =>
  props.sourceSchema.all()
    .filter((f) => f.path.startsWith('Zaak') && !mappedSourceIds.value.has(f.id))
    .slice(0, 5),
)

const unmappedTargetFields = computed(() =>
  props.targetSchema.all().filter((f) => !mappedTargetIds.value.has(f.id)),
)

const zaakUnmappedTargetFields = computed(() =>
  unmappedTargetFields.value.filter((f) => f.path.startsWith('Zaak')).slice(0, 5),
)

const resolvedSuggestions = computed(() =>
  aiStore.suggestions.map((s) => ({
    id: s.id,
    sourceName: props.sourceSchema.byId(s.sourceFieldId)?.name ?? s.sourceFieldId,
    targetName: props.targetSchema.byId(s.targetFieldId)?.name ?? s.targetFieldId,
    confidenceScore: s.confidenceScore,
  })),
)

const showStatsDialog = ref(false)
const showLowConfidence = ref(false)

const resolvedLowConfidence = computed(() =>
  aiStore.lowConfidenceSuggestions.map((s) => ({
    id: s.id,
    sourceName: props.sourceSchema.byId(s.sourceFieldId)?.name ?? s.sourceFieldId,
    targetName: props.targetSchema.byId(s.targetFieldId)?.name ?? s.targetFieldId,
    confidenceScore: s.confidenceScore,
  })),
)

async function generate() {
  await aiStore.generateSuggestions(zaakSourceFields.value, zaakUnmappedTargetFields.value)
}
</script>

<template>
  <!-- Stats button row -->
  <div v-if="aiStore.totalGenerated > 0" class="flex justify-end px-2 py-1 border-b border-slate-100 shrink-0">
    <button
      class="p-1 text-slate-400 hover:text-slate-600 rounded"
      data-testid="stats-button"
      title="Acceptatiestatistieken"
      @click="showStatsDialog = !showStatsDialog"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 4-4" />
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="showStatsDialog"
        class="fixed inset-0 z-50 flex items-start justify-end pt-16 pr-4 pointer-events-none"
      >
        <div
          class="pointer-events-auto bg-white border border-slate-200 rounded-lg shadow-xl p-4 min-w-[200px] text-sm"
          data-testid="stats-dialog"
        >
          <p class="font-semibold text-slate-700 mb-2">Acceptatiestatistieken</p>
          <ul class="flex flex-col gap-1.5 text-slate-600">
            <li class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-slate-300 inline-block" />
              {{ aiStore.totalGenerated }} gegenereerd
            </li>
            <li class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-green-500 inline-block" />
              {{ aiStore.accepted }} geaccepteerd
            </li>
            <li class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full bg-red-500 inline-block" />
              {{ aiStore.rejected }} afgewezen
            </li>
          </ul>
          <button
            class="mt-3 text-xs text-slate-400 hover:text-slate-600"
            @click="showStatsDialog = false"
          >
            Sluiten
          </button>
        </div>
      </div>
    </Teleport>
  </div>

  <!-- Loading -->
  <div
    v-if="aiStore.isLoading"
    class="flex-1 flex items-center justify-center py-10"
    data-testid="loading-state"
  >
    <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
  </div>

  <template v-else>
    <!-- Error banner (shown above suggestions when present) -->
    <div
      v-if="aiStore.error"
      class="shrink-0 flex flex-col gap-2 px-3 py-2.5 bg-red-50 border-b border-red-100 text-red-700 text-sm"
      data-testid="error-state"
    >
      <p>AI-service niet beschikbaar. U kunt handmatig koppelen of opnieuw proberen.</p>
      <button
        v-if="zaakUnmappedTargetFields.length > 0"
        class="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded"
        data-testid="generate-button"
        @click="generate"
      >
        Opnieuw genereren
      </button>
    </div>

    <!-- Empty: all target fields already mapped (only without error) -->
    <div
      v-if="zaakUnmappedTargetFields.length === 0 && !aiStore.error"
      class="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 text-slate-400 text-sm"
      data-testid="empty-state"
    >
      <p>Geen ongemapte doelvelden.</p>
    </div>

    <!-- Suggestions list -->
    <div v-else-if="resolvedSuggestions.length > 0 || resolvedLowConfidence.length > 0" class="flex-1 overflow-y-auto flex flex-col gap-2 p-3">
      <!-- Generate again button when only low-confidence suggestions remain -->
      <div v-if="aiStore.suggestions.length === 0 && zaakUnmappedTargetFields.length > 0" class="flex justify-center mb-1">
        <button
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
          data-testid="generate-button"
          @click="generate"
        >
          Genereer suggesties
        </button>
      </div>

      <AISuggestionCard
        v-for="s in resolvedSuggestions"
        :key="s.id"
        :suggestion-id="s.id"
        :source-name="s.sourceName"
        :target-name="s.targetName"
        :confidence-score="s.confidenceScore"
        @accept="aiStore.acceptSuggestion($event)"
        @reject="aiStore.rejectSuggestion($event)"
      />

      <!-- Low-confidence collapsible -->
      <div v-if="resolvedLowConfidence.length > 0" class="mt-1">
        <button
          class="w-full flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 py-1"
          data-testid="low-confidence-toggle"
          @click="showLowConfidence = !showLowConfidence"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 transition-transform" :class="showLowConfidence ? 'rotate-90' : ''" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          {{ resolvedLowConfidence.length }} lage zekerheid (&lt; 70%)
        </button>
        <div v-if="showLowConfidence" class="flex flex-col gap-2 mt-1" data-testid="low-confidence-list">
          <AISuggestionCard
            v-for="s in resolvedLowConfidence"
            :key="s.id"
            :suggestion-id="s.id"
            :source-name="s.sourceName"
            :target-name="s.targetName"
            :confidence-score="s.confidenceScore"
            @accept="aiStore.acceptSuggestion($event)"
            @reject="aiStore.rejectSuggestion($event)"
          />
        </div>
      </div>
    </div>

    <!-- Default: generate button (no error, no suggestions, unmapped fields exist) -->
    <div v-else-if="!aiStore.error" class="flex-1 flex items-center justify-center py-10">
      <button
        class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg"
        data-testid="generate-button"
        @click="generate"
      >
        Genereer suggesties
      </button>
    </div>
  </template>
</template>
