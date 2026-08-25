<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Schema } from '@/domain/schema'
import { useAISuggestions, AIKeyRejectedError } from '@/composables/useAISuggestions'
import { useMappings } from '@/composables/useMappings'
import { useApiKey } from '@/composables/useApiKey'
import { useSuggestionScope } from '@/composables/useSuggestionScope'
import AISuggestionCard from './AISuggestionCard.vue'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
}>()

const aiStore = useAISuggestions()
const mappingsStore = useMappings()
const scopeStore = useSuggestionScope()
const { hasKey, getKey, removeStoredKey } = useApiKey()

const keyRejected = computed(() => aiStore.error instanceof AIKeyRejectedError)

watch(keyRejected, (isRejected) => {
  if (isRejected) removeStoredKey()
})

const mappedSourceIds = computed(() => new Set(mappingsStore.mappings.map((m) => m.sourceFieldId)))
const mappedTargetIds = computed(() => new Set(mappingsStore.mappings.map((m) => m.targetFieldId)))

const scopedSourceFields = computed(() =>
  scopeStore
    .scopedLeaves('source', props.sourceSchema)
    .filter((f) => !mappedSourceIds.value.has(f.id)),
)

// Per Feature #89 AC: the target side is always fully included in the
// suggestion call — every unmapped target leaf, not gated by scope.
const scopedTargetFields = computed(() =>
  props.targetSchema
    .all()
    .filter(
      (f) => !mappedTargetIds.value.has(f.id) && props.targetSchema.childrenOf(f.id).length === 0,
    ),
)

const canGenerate = computed(
  () =>
    scopeStore.hasSourceSelection &&
    scopedSourceFields.value.length > 0 &&
    scopedTargetFields.value.length > 0,
)
const scopeHasNothingToSuggest = computed(
  () => scopeStore.hasSourceSelection && scopedTargetFields.value.length === 0,
)
const canShowEmptyState = computed(() => !aiStore.error && scopeHasNothingToSuggest.value)

const resolvedSuggestions = computed(() =>
  aiStore.suggestions.map((s) => ({
    id: s.id,
    sourceName: props.sourceSchema.byId(s.sourceFieldId)?.path ?? s.sourceFieldId,
    targetName: props.targetSchema.byId(s.targetFieldId)?.path ?? s.targetFieldId,
    confidenceScore: s.confidenceScore,
    reasoning: s.reasoning,
  })),
)

const showStatsDialog = ref(false)
const showLowConfidence = ref(false)

const resolvedLowConfidence = computed(() =>
  aiStore.lowConfidenceSuggestions.map((s) => ({
    id: s.id,
    sourceName: props.sourceSchema.byId(s.sourceFieldId)?.path ?? s.sourceFieldId,
    targetName: props.targetSchema.byId(s.targetFieldId)?.path ?? s.targetFieldId,
    confidenceScore: s.confidenceScore,
    reasoning: s.reasoning,
  })),
)

// The suggestion run always sends every scoped/unmapped field on both sides.
// A "testrun" cap that capped this to the first N fields was tried and
// removed: with a broad scope (e.g. select-all) the first N source/target
// fields landed in unrelated schema areas by array order, so the AI
// correctly returned no confident matches — but the panel gave no feedback
// distinguishing that from a broken generate call, making the cap look like
// a bug rather than a cost-saving measure. In practice sending the full
// scoped schema on both sides is neither slow nor expensive enough to
// justify that confusion, so there's no cap to opt into anymore.
async function generate() {
  await aiStore.generateSuggestions(scopedSourceFields.value, scopedTargetFields.value)
}

async function changeKey() {
  removeStoredKey()
  await getKey()
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <!-- Stats button row -->
    <div
      v-if="aiStore.totalGenerated > 0"
      class="flex justify-end px-2 py-1 border-b border-slate-100 shrink-0"
    >
      <button
        class="p-1 text-slate-400 hover:text-slate-600 rounded"
        data-testid="stats-button"
        title="Acceptatiestatistieken"
        @click="showStatsDialog = !showStatsDialog"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 3v18h18" />
          <path d="M7 16l4-4 4 4 4-4" />
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
      <div
        class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"
      />
    </div>

    <template v-else>
      <!-- Key rejected: stored key was rejected mid-session -->
      <div
        v-if="keyRejected"
        class="shrink-0 flex flex-col gap-2 px-3 py-2.5 bg-amber-50 border-b border-amber-100 text-amber-800 text-sm"
        data-testid="key-rejected-state"
      >
        <p>Je API-sleutel is geweigerd. Voer een nieuwe sleutel in om door te gaan.</p>
        <button
          class="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded"
          data-testid="update-key-button"
          @click="getKey()"
        >
          Werk je API-sleutel bij
        </button>
      </div>

      <!-- Generic error banner (shown above suggestions when present) -->
      <div
        v-else-if="aiStore.error"
        class="shrink-0 flex flex-col gap-2 px-3 py-2.5 bg-red-50 border-b border-red-100 text-red-700 text-sm"
        data-testid="error-state"
      >
        <p>AI-service niet beschikbaar. U kunt handmatig koppelen of opnieuw proberen.</p>
        <button
          v-if="scopedTargetFields.length > 0"
          class="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded disabled:bg-slate-300 disabled:cursor-not-allowed"
          data-testid="generate-button"
          :disabled="!canGenerate"
          @click="generate"
        >
          Opnieuw genereren
        </button>
      </div>

      <!-- Empty: no unmapped target fields within the selected scope (or overall) -->
      <div
        v-if="canShowEmptyState"
        class="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 text-slate-400 text-sm"
        data-testid="empty-state"
      >
        <p v-if="scopeHasNothingToSuggest">
          Geen ongemapte doelvelden binnen het geselecteerde bereik.
        </p>
        <p v-else>Geen ongemapte doelvelden.</p>
      </div>

      <!-- Suggestions list -->
      <div
        v-else-if="resolvedSuggestions.length > 0 || resolvedLowConfidence.length > 0"
        class="flex-1 overflow-y-auto flex flex-col gap-2 p-3"
      >
        <!-- Generate again button when only low-confidence suggestions remain -->
        <div
          v-if="aiStore.suggestions.length === 0 && scopedTargetFields.length > 0"
          class="flex justify-center mb-1"
        >
          <button
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed"
            data-testid="generate-button"
            :disabled="!canGenerate"
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
          :reasoning="s.reasoning"
          @accept="aiStore.acceptSuggestion($event, { source: sourceSchema, target: targetSchema })"
          @reject="aiStore.rejectSuggestion($event)"
        />

        <!-- Low-confidence collapsible -->
        <div v-if="resolvedLowConfidence.length > 0" class="mt-1">
          <button
            class="w-full flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 py-1"
            data-testid="low-confidence-toggle"
            @click="showLowConfidence = !showLowConfidence"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-3 h-3 transition-transform"
              :class="showLowConfidence ? 'rotate-90' : ''"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
            {{ resolvedLowConfidence.length }} lage zekerheid (&lt; 70%)
          </button>
          <div
            v-if="showLowConfidence"
            class="flex flex-col gap-2 mt-1"
            data-testid="low-confidence-list"
          >
            <AISuggestionCard
              v-for="s in resolvedLowConfidence"
              :key="s.id"
              :suggestion-id="s.id"
              :source-name="s.sourceName"
              :target-name="s.targetName"
              :confidence-score="s.confidenceScore"
              :reasoning="s.reasoning"
              @accept="
                aiStore.acceptSuggestion($event, { source: sourceSchema, target: targetSchema })
              "
              @reject="aiStore.rejectSuggestion($event)"
            />
          </div>
        </div>
      </div>

      <!-- No API key: show placeholder instead of generate button -->
      <div
        v-else-if="!aiStore.error && !hasKey"
        class="flex-1 flex flex-col items-center justify-center text-center px-6 py-10 text-slate-500 text-sm gap-3"
        data-testid="no-key-placeholder"
      >
        <p>Stel je API-sleutel in om AI-suggesties te gebruiken.</p>
        <button
          class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded"
          data-testid="setup-key-button"
          @click="getKey()"
        >
          Stel je API-sleutel in
        </button>
      </div>

      <!-- Default: generate button (no error, no suggestions, unmapped fields exist, key present) -->
      <div
        v-else-if="!aiStore.error"
        class="flex-1 flex flex-col items-center justify-center gap-2 py-10"
      >
        <button
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:bg-slate-300 disabled:cursor-not-allowed"
          data-testid="generate-button"
          :disabled="!canGenerate"
          @click="generate"
        >
          Genereer suggesties
        </button>
        <p
          v-if="!scopeStore.hasSourceSelection"
          class="text-xs text-red-600 max-w-xs px-6 text-center"
          data-testid="scope-required-hint"
        >
          Selecteer minstens één veld in het bronschema om suggesties te genereren.
        </p>
      </div>

      <!-- API key affordance — visible when a key is stored -->
      <div
        v-if="hasKey"
        class="shrink-0 flex items-center justify-end gap-3 px-3 py-2 border-t border-slate-100 text-xs text-slate-400"
        data-testid="api-key-affordance"
      >
        <button class="hover:text-slate-600" data-testid="change-key-button" @click="changeKey">
          Wijzig sleutel
        </button>
        <button class="hover:text-red-600" data-testid="remove-key-button" @click="removeStoredKey">
          Verwijder sleutel
        </button>
      </div>
    </template>
  </div>
</template>
