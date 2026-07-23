<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useTransformationSuggestions } from '@/composables/useTransformationSuggestions'
import { getValidationStatus, getIncompatibilityReason } from '@/utils/validationStatus'
import { getMismatchTypes, isMismatchResolved } from '@/utils/transformationCompletion'
import type { MismatchType } from '@/types/mapping'
import TransformationRuleList from './TransformationRuleList.vue'
import MismatchCard from './MismatchCard.vue'
import TruncationDialog from './TruncationDialog.vue'
import DefaultValueDialog from './DefaultValueDialog.vue'
import CastConfirmDialog from './CastConfirmDialog.vue'
import DateFormatDialog from './DateFormatDialog.vue'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
}>()

const store = useMappings()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suggestionsStore = useTransformationSuggestions() as any

const FALLBACK_TYPE = { bg: 'bg-slate-100', text: 'text-slate-400', label: '?' }
const typeConfig: Record<string, { bg: string; text: string; label: string }> = {
  string: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'str' },
  number: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'num' },
  boolean: { bg: 'bg-purple-50', text: 'text-purple-600', label: 'bool' },
  date: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'date' },
  object: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'obj' },
  array: { bg: 'bg-cyan-50', text: 'text-cyan-600', label: 'arr' },
}

function typeOf(dataType: string) {
  return typeConfig[dataType] ?? FALLBACK_TYPE
}

const selectedMapping = computed(() =>
  store.selectedMappingId
    ? (store.mappings.find((m) => m.id === store.selectedMappingId) ?? null)
    : null,
)

const sourceField = computed(() =>
  selectedMapping.value
    ? (props.sourceSchema.byId(selectedMapping.value.sourceFieldId) ?? null)
    : null,
)

const targetField = computed(() =>
  selectedMapping.value
    ? (props.targetSchema.byId(selectedMapping.value.targetFieldId) ?? null)
    : null,
)

const validationStatus = computed(() =>
  sourceField.value && targetField.value
    ? getValidationStatus(sourceField.value, targetField.value)
    : null,
)

const incompatibilityReason = computed(() =>
  sourceField.value && targetField.value && validationStatus.value === 'incompatible'
    ? getIncompatibilityReason(sourceField.value, targetField.value)
    : null,
)

const detectedMismatches = computed((): MismatchType[] =>
  sourceField.value && targetField.value
    ? getMismatchTypes(sourceField.value, targetField.value)
    : [],
)

function mismatchLabel(type: MismatchType): string {
  switch (type) {
    case 'truncate':
      return 'Maximale lengte overschreden'
    case 'default':
      return 'Bronveld is optioneel, doelveld is verplicht'
    case 'cast':
      return 'Type conversie vereist'
    case 'date-format':
      return 'Datumformaat conversie'
  }
}

function isMismatchResolvedForMapping(type: MismatchType): boolean {
  return selectedMapping.value
    ? isMismatchResolved(type, selectedMapping.value.transformations)
    : false
}

function isMismatchManuallyResolvedForMapping(type: MismatchType): boolean {
  return selectedMapping.value?.manuallyResolvedMismatches?.includes(type) ?? false
}

const activeDialog = ref<MismatchType | null>(null)

function openDialog(type: MismatchType) {
  activeDialog.value = type
}

function closeDialog() {
  activeDialog.value = null
}

async function requestAiSuggestion() {
  if (!selectedMapping.value || !sourceField.value || !targetField.value) return
  await suggestionsStore.generateSuggestion(
    selectedMapping.value.id,
    sourceField.value,
    targetField.value,
    selectedMapping.value.transformations,
  )
}
</script>

<template>
  <div
    v-if="selectedMapping && sourceField && targetField"
    class="flex flex-col bg-white border border-slate-200 rounded-sm overflow-hidden h-full"
    data-testid="coupling-detail-panel"
  >
    <!-- Header -->
    <div class="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between shrink-0">
      <span class="text-sm font-medium text-slate-700">Koppelingsdetail</span>
      <button
        class="text-slate-400 hover:text-slate-600 transition-colors leading-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-400 rounded"
        data-testid="detail-close"
        aria-label="Close coupling detail"
        @click="store.selectMapping(null)"
      >
        ×
      </button>
    </div>

    <!-- Scrollable body -->
    <div class="overflow-y-auto min-h-0 flex-1">
      <!-- Source field -->
      <div class="px-4 pt-4 pb-2" data-testid="detail-source-field">
        <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Bronveld</p>
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm text-[color:var(--color-source)] truncate flex-1">
            {{ sourceField.name }}
          </span>
          <span
            :class="[
              'shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium',
              typeOf(sourceField.dataType).bg,
              typeOf(sourceField.dataType).text,
            ]"
          >
            {{ typeOf(sourceField.dataType).label }}
          </span>
          <span
            v-if="sourceField.required"
            class="shrink-0 bg-rose-50 text-rose-600 text-[10px] rounded px-1 font-medium"
            >REQ</span
          >
        </div>
        <p
          v-if="sourceField.dataType === 'string' && sourceField.maxLength"
          class="text-[11px] text-slate-400 mt-0.5"
        >
          max. {{ sourceField.maxLength }}
        </p>
      </div>

      <!-- Arrow separator -->
      <div class="px-4 py-1 text-center text-slate-300 text-xs">→</div>

      <!-- Target field -->
      <div class="px-4 pt-2 pb-4" data-testid="detail-target-field">
        <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Doelveld</p>
        <div class="flex items-center gap-2">
          <span class="font-mono text-sm text-[color:var(--color-destination)] truncate flex-1">
            {{ targetField.name }}
          </span>
          <span
            :class="[
              'shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium',
              typeOf(targetField.dataType).bg,
              typeOf(targetField.dataType).text,
            ]"
          >
            {{ typeOf(targetField.dataType).label }}
          </span>
          <span
            v-if="targetField.required"
            class="shrink-0 bg-rose-50 text-rose-600 text-[10px] rounded px-1 font-medium"
            >REQ</span
          >
        </div>
        <p
          v-if="targetField.dataType === 'string' && targetField.maxLength"
          class="text-[11px] text-slate-400 mt-0.5"
        >
          max. {{ targetField.maxLength }}
        </p>
      </div>

      <!-- Validation badge -->
      <div
        class="mx-4 mb-3 rounded px-3 py-2 text-sm"
        :class="{
          'bg-emerald-50 text-emerald-700': validationStatus === 'compatible',
          'bg-amber-50 text-amber-700': validationStatus === 'constrained',
          'bg-red-50 text-red-700': validationStatus === 'incompatible',
        }"
        role="status"
        data-testid="detail-validation-section"
      >
        <template v-if="validationStatus === 'compatible'">
          <span class="font-medium">✓ Koppeling is compatibel.</span>
        </template>
        <template v-else-if="validationStatus === 'incompatible'">
          <span class="font-medium">✕ {{ incompatibilityReason }}</span>
          <p class="mt-1 text-xs" data-testid="remap-note">
            Deze koppeling moet opnieuw worden gemaakt.
          </p>
        </template>
        <template v-else>
          <span class="font-medium">⚠ Transformatie vereist</span>
        </template>
      </div>

      <!-- Transformatieregels section -->
      <div class="mx-4 mb-3">
        <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Transformatieregels</p>
        <TransformationRuleList
          :rules="selectedMapping.transformations"
          :mapping-id="selectedMapping.id"
        />
      </div>

      <!-- Gedetecteerde problemen section -->
      <div v-if="detectedMismatches.length > 0" class="mx-4 mb-3">
        <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">
          Gedetecteerde problemen
        </p>
        <div class="space-y-1.5">
          <MismatchCard
            v-for="type in detectedMismatches"
            :key="type"
            :type="type"
            :resolved="isMismatchResolvedForMapping(type)"
            :manually-resolved="isMismatchManuallyResolvedForMapping(type)"
            :label="mismatchLabel(type)"
            @solve="openDialog(type)"
            @toggle-manual-resolution="
              store.toggleManualMismatchResolution(selectedMapping!.id, type)
            "
          />
        </div>
      </div>

      <!-- Active dialog -->
      <div
        v-if="activeDialog"
        class="mx-4 mb-3 border border-slate-200 rounded"
        data-testid="dialog-container"
      >
        <TruncationDialog
          v-if="activeDialog === 'truncate'"
          :mapping-id="selectedMapping.id"
          :source-path="sourceField.path"
          :target-max-length="targetField.maxLength"
          @close="closeDialog"
        />
        <DefaultValueDialog
          v-else-if="activeDialog === 'default'"
          :mapping-id="selectedMapping.id"
          :source-path="sourceField.path"
          @close="closeDialog"
        />
        <CastConfirmDialog
          v-else-if="activeDialog === 'cast'"
          :mapping-id="selectedMapping.id"
          :source-path="sourceField.path"
          :from-type="sourceField.dataType"
          :to-type="targetField.dataType"
          @close="closeDialog"
        />
        <DateFormatDialog
          v-else-if="activeDialog === 'date-format'"
          :mapping-id="selectedMapping.id"
          :source-path="sourceField.path"
          @close="closeDialog"
        />
      </div>

      <!-- AI Suggestie button -->
      <div class="mx-4 mb-4">
        <button
          class="w-full text-xs border border-violet-300 text-violet-700 rounded px-3 py-1.5 hover:bg-violet-50"
          data-testid="ai-suggestion-btn"
          @click="requestAiSuggestion"
        >
          AI Suggestie
        </button>
      </div>
    </div>
    <!-- end scrollable body -->
  </div>
</template>
