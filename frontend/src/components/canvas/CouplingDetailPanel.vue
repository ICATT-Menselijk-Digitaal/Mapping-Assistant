<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Schema } from '@/domain/schema'
import { useMappings } from '@/composables/useMappings'
import { useTransformationSuggestions } from '@/composables/useTransformationSuggestions'
import { analyze, isMismatchResolved } from '@/domain/coupling'
import { fieldTypeBadge } from '@/utils/fieldTypeBadge'
import { formatRelativeTime } from '@/utils/formatRelativeTime'
import { MAX_COMMENT_LENGTH } from '@/domain/mappingOps'
import type { MismatchType } from '@/types/mapping'
import TransformationRuleList from './TransformationRuleList.vue'
import MismatchCard from './MismatchCard.vue'
import TruncationDialog from './TruncationDialog.vue'
import DefaultValueDialog from './DefaultValueDialog.vue'
import CastConfirmDialog from './CastConfirmDialog.vue'
import DateFormatDialog from './DateFormatDialog.vue'
import FieldPath from './FieldPath.vue'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
}>()

const store = useMappings()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const suggestionsStore = useTransformationSuggestions() as any

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

const analysis = computed(() =>
  sourceField.value && targetField.value ? analyze(sourceField.value, targetField.value) : null,
)

const validationStatus = computed(() => analysis.value?.status ?? null)

const incompatibilityReason = computed(() =>
  sourceField.value && targetField.value && analysis.value?.status === 'incompatible'
    ? `${sourceField.value.dataType} kan niet worden omgezet naar ${targetField.value.dataType}`
    : null,
)

const detectedMismatches = computed((): MismatchType[] => analysis.value?.mismatches ?? [])

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

const isEditingComment = ref(false)
const commentDraft = ref('')
const commentMenuOpen = ref(false)
const isConfirmingCommentRemoval = ref(false)

// Reset any in-progress comment edit when the selected Koppeling changes,
// so leftover draft text from one mapping never leaks into another.
watch(selectedMapping, () => {
  isEditingComment.value = false
  commentMenuOpen.value = false
  commentDraft.value = ''
  isConfirmingCommentRemoval.value = false
})

function startAddComment() {
  commentDraft.value = ''
  isEditingComment.value = true
}

function startEditComment() {
  commentDraft.value = selectedMapping.value?.comment ?? ''
  commentMenuOpen.value = false
  isEditingComment.value = true
}

function cancelCommentEdit() {
  isEditingComment.value = false
  commentDraft.value = ''
}

// Blank/whitespace-only input is never saved as a comment — the Opslaan
// button is disabled for it (see template), so this only guards direct
// calls (e.g. a future keyboard shortcut) against the same inconsistent
// state: hasComment true but nothing to show or remove.
const canSaveComment = computed(() => commentDraft.value.trim().length > 0)

function saveComment() {
  if (!selectedMapping.value || !canSaveComment.value) return
  store.setComment(selectedMapping.value.id, commentDraft.value)
  isEditingComment.value = false
  commentDraft.value = ''
}

function requestRemoveComment() {
  commentMenuOpen.value = false
  isConfirmingCommentRemoval.value = true
}

function confirmRemoveComment() {
  if (!selectedMapping.value) return
  store.removeComment(selectedMapping.value.id)
  isConfirmingCommentRemoval.value = false
}

function cancelRemoveComment() {
  isConfirmingCommentRemoval.value = false
}
</script>

<template>
  <div
    v-if="selectedMapping"
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
        <div v-if="sourceField" class="flex items-center gap-2">
          <span
            class="font-mono text-sm text-[color:var(--color-source)] flex-1 min-w-0 break-words hyphens-none"
          >
            <FieldPath :path="sourceField.path" />
          </span>
          <span
            :class="[
              'shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium',
              fieldTypeBadge(sourceField.dataType).bg,
              fieldTypeBadge(sourceField.dataType).text,
            ]"
          >
            {{ fieldTypeBadge(sourceField.dataType).label }}
          </span>
          <span
            v-if="sourceField.required"
            class="shrink-0 bg-rose-50 text-rose-600 text-[10px] rounded px-1 font-medium"
            >REQ</span
          >
        </div>
        <p v-else class="text-sm text-amber-700">Bronveld ontbreekt</p>
        <p
          v-if="sourceField?.dataType === 'string' && sourceField.maxLength"
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
        <div v-if="targetField" class="flex items-center gap-2">
          <span
            class="font-mono text-sm text-[color:var(--color-destination)] flex-1 min-w-0 break-words hyphens-none"
          >
            <FieldPath :path="targetField.path" />
          </span>
          <span
            :class="[
              'shrink-0 text-[11px] leading-none px-1.5 py-0.5 rounded font-medium',
              fieldTypeBadge(targetField.dataType).bg,
              fieldTypeBadge(targetField.dataType).text,
            ]"
          >
            {{ fieldTypeBadge(targetField.dataType).label }}
          </span>
          <span
            v-if="targetField.required"
            class="shrink-0 bg-rose-50 text-rose-600 text-[10px] rounded px-1 font-medium"
            >REQ</span
          >
        </div>
        <p v-else class="text-sm text-amber-700">Doelveld ontbreekt</p>
        <p
          v-if="targetField?.dataType === 'string' && targetField.maxLength"
          class="text-[11px] text-slate-400 mt-0.5"
        >
          max. {{ targetField.maxLength }}
        </p>
      </div>

      <!-- Validation badge -->
      <div
        v-if="sourceField && targetField"
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
      <div v-if="sourceField && targetField" class="mx-4 mb-3">
        <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Transformatieregels</p>
        <TransformationRuleList
          :rules="selectedMapping.transformations"
          :mapping-id="selectedMapping.id"
        />
      </div>

      <!-- Gedetecteerde problemen section -->
      <div v-if="sourceField && targetField && detectedMismatches.length > 0" class="mx-4 mb-3">
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

      <!-- Active dialog (only reachable via the mismatches section, which is
      itself gated on both fields resolving) -->
      <div
        v-if="activeDialog && sourceField && targetField"
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
      <div v-if="sourceField && targetField" class="mx-4 mb-4">
        <button
          class="w-full text-xs border border-violet-300 text-violet-700 rounded px-3 py-1.5 hover:bg-violet-50"
          data-testid="ai-suggestion-btn"
          @click="requestAiSuggestion"
        >
          AI Suggestie
        </button>
      </div>

      <!-- Opmerking section -->
      <div class="mx-4 mb-4" data-testid="opmerking-section">
        <p class="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">Opmerking</p>

        <button
          v-if="!selectedMapping.comment && !isEditingComment"
          class="w-full text-xs border border-slate-300 text-slate-600 rounded px-3 py-1.5 hover:bg-slate-50"
          data-testid="opmerking-add-button"
          @click="startAddComment"
        >
          Opmerking toevoegen
        </button>

        <div v-else-if="isEditingComment" class="flex flex-col gap-1.5">
          <textarea
            v-model="commentDraft"
            :maxlength="MAX_COMMENT_LENGTH"
            rows="10"
            class="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-400 resize-none"
            data-testid="opmerking-textarea"
          />
          <p
            class="text-[11px] text-right"
            :class="commentDraft.length >= MAX_COMMENT_LENGTH ? 'text-red-600' : 'text-slate-400'"
            data-testid="opmerking-char-count"
          >
            {{ commentDraft.length }}/{{ MAX_COMMENT_LENGTH }}
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded"
              data-testid="opmerking-cancel-button"
              @click="cancelCommentEdit"
            >
              Annuleren
            </button>
            <button
              class="px-3 py-1 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded disabled:bg-slate-300 disabled:cursor-not-allowed"
              data-testid="opmerking-save-button"
              :disabled="!canSaveComment"
              @click="saveComment"
            >
              Opslaan
            </button>
          </div>
        </div>

        <div
          v-else
          class="relative bg-slate-50 border border-slate-200 rounded px-3 py-2"
          data-testid="opmerking-card"
        >
          <div class="flex items-start justify-between gap-2">
            <p
              class="text-sm text-slate-700 break-words flex-1 min-w-0"
              style="white-space: pre-wrap"
              data-testid="opmerking-text"
            >
              {{ selectedMapping.comment }}
            </p>
            <button
              class="shrink-0 text-slate-400 hover:text-slate-600 leading-none px-1"
              data-testid="opmerking-menu-toggle"
              aria-label="Opmerking opties"
              @click.stop="commentMenuOpen = !commentMenuOpen"
            >
              ⋮
            </button>
          </div>
          <p class="text-[11px] text-slate-400 mt-1" data-testid="opmerking-timestamp">
            {{ formatRelativeTime(selectedMapping.commentedAt!) }} ·
            {{ new Date(selectedMapping.commentedAt!).toLocaleString('nl-NL') }}
          </p>
          <div
            v-if="commentMenuOpen"
            class="absolute right-2 top-8 bg-white border border-slate-200 rounded shadow-md text-xs z-10"
          >
            <button
              class="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
              data-testid="opmerking-edit"
              @click="startEditComment"
            >
              Bewerken
            </button>
            <button
              class="block w-full text-left px-3 py-1.5 hover:bg-slate-50 text-red-600"
              data-testid="opmerking-remove"
              @click="requestRemoveComment"
            >
              Verwijderen
            </button>
          </div>
        </div>
      </div>
    </div>
    <!-- end scrollable body -->

    <!-- Opmerking delete confirmation overlay -->
    <div
      v-if="isConfirmingCommentRemoval"
      class="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
      data-testid="opmerking-delete-confirmation"
    >
      <div class="bg-white rounded-lg shadow-lg px-6 py-5 max-w-xs w-full mx-4">
        <div class="text-sm text-slate-700 mb-4">
          <p>Weet je zeker dat je deze opmerking wilt verwijderen?</p>
        </div>
        <div class="flex justify-end gap-2">
          <button
            class="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded"
            @click="cancelRemoveComment"
          >
            Annuleren
          </button>
          <button
            class="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded"
            data-testid="opmerking-confirm-delete"
            @click="confirmRemoveComment"
          >
            Verwijderen
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
