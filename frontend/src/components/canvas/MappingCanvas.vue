<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { Schema } from '@/domain/schema'
import SourceSchemaPanel from './SourceSchemaPanel.vue'
import SchemaColumnHeader from './SchemaColumnHeader.vue'
import ConnectionLines from './ConnectionLines.vue'
import DefaultValueConfirmDialog from './DefaultValueConfirmDialog.vue'
import AlternativeStorageConfirmDialog from './AlternativeStorageConfirmDialog.vue'
import ReplaceCouplingConfirmDialog from './ReplaceCouplingConfirmDialog.vue'
import { useMappings } from '@/composables/useMappings'
import { useAISuggestions } from '@/composables/useAISuggestions'
import { alternativeStorageName } from '@/domain/mappingOps'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
  sourceLabel?: string
  targetLabel?: string
  sourceEligibleSchemaNames?: string[] | null
  targetEligibleSchemaNames?: string[] | null
}>()

const emit = defineEmits<{
  FieldMappingCreated: [payload: { sourceFieldId: string; targetFieldId: string }]
  FieldMappingRemoved: [payload: { sourceFieldId: string; targetFieldId: string }]
  SourceFileSelected: [file: File]
  SourceUrlEntered: [url: string]
  TargetFileSelected: [file: File]
  TargetUrlEntered: [url: string]
}>()

const mappingsStore = useMappings()
const { selectedMappingId, selectionNonce, mappings } = storeToRefs(mappingsStore)
const aiStore = useAISuggestions()
const {
  tracedSuggestionId,
  selectionNonce: traceSelectionNonce,
  suggestions: aiSuggestions,
  lowConfidenceSuggestions: aiLowConfidenceSuggestions,
} = storeToRefs(aiStore)
const selectedSourceId = ref<string | null>(null)

const sourcePanelRef = ref<InstanceType<typeof SourceSchemaPanel> | null>(null)
const targetPanelRef = ref<InstanceType<typeof SourceSchemaPanel> | null>(null)
const sourceColumnRef = ref<HTMLElement | null>(null)
const targetColumnRef = ref<HTMLElement | null>(null)

// Clicking anywhere outside both schema panels cancels an in-progress manual
// mapping selection. A click inside either column is handled by that
// column's own field-click handler first (component listeners fire before a
// document-level bubble listener), so this never undoes the very click that
// just set the selection.
function clearSelectionIfOutsidePanels(event: MouseEvent) {
  const target = event.target as Node | null
  if (!target) return
  if (sourceColumnRef.value?.contains(target)) return
  if (targetColumnRef.value?.contains(target)) return
  selectedSourceId.value = null
}

onMounted(() => {
  document.addEventListener('click', clearSelectionIfOutsidePanels)
})

onUnmounted(() => {
  document.removeEventListener('click', clearSelectionIfOutsidePanels)
})

// Watches selectionNonce (bumped on every selectMapping() call) rather than
// selectedMappingId directly, so reselecting the currently selected mapping
// still scrolls — a value-based watch on selectedMappingId would no-op.
watch(selectionNonce, async () => {
  const id = selectedMappingId.value
  if (!id) return
  const mapping = mappings.value.find((m) => m.id === id)
  if (!mapping) return
  await nextTick()
  if (mapping.sourceFieldId) sourcePanelRef.value?.scrollToField(mapping.sourceFieldId)
  // A target-less (alternative-storage) coupling has no target to scroll to.
  if (mapping.targetFieldId) targetPanelRef.value?.scrollToField(mapping.targetFieldId)
})

// Traced AI suggestion (Task #145 / Feature #127): mirrors the mapping-
// selection watcher above so scrolling behaves identically for a suggestion
// under review. Watches traceSelectionNonce so clicking the same suggestion
// still re-scrolls; a value-based watch on tracedSuggestionId would no-op
// after the toggle-off/toggle-on sequence.
watch(traceSelectionNonce, async () => {
  const id = tracedSuggestionId.value
  if (!id) return
  const suggestion =
    aiSuggestions.value.find((s) => s.id === id) ??
    aiLowConfidenceSuggestions.value.find((s) => s.id === id)
  if (!suggestion) return
  await nextTick()
  sourcePanelRef.value?.scrollToField(suggestion.sourceFieldId)
  targetPanelRef.value?.scrollToField(suggestion.targetFieldId)
})

const sourceCounter = computed(() => {
  // A source-less coupling has no sourceFieldId to count.
  const mappedIds = new Set(
    mappingsStore.mappings.map((m) => m.sourceFieldId).filter((id): id is string => id !== null),
  )
  return { mapped: mappedIds.size, total: props.sourceSchema.all().length }
})

const targetCounter = computed(() => {
  const mappedTargetIds = new Set(
    mappingsStore.mappings.map((m) => m.targetFieldId).filter((id): id is string => id !== null),
  )
  return {
    mapped: props.targetSchema.all().filter((f) => mappedTargetIds.has(f.id)).length,
    total: props.targetSchema.all().length,
  }
})

function onSourceFieldClick(fieldId: string) {
  selectedSourceId.value = selectedSourceId.value === fieldId ? null : fieldId
}

// Creates a source-bound mapping and emits FieldMappingCreated — shared by
// the direct-create path below and the replace-confirmation's confirm action.
function createMappingAndEmit(sourceFieldId: string, targetFieldId: string) {
  const mapping = mappingsStore.createMapping({
    sourceFieldId,
    targetFieldId,
    schemas: { source: props.sourceSchema, target: props.targetSchema },
  })

  // Both ids are always set here — this path always supplies them above —
  // the guard only satisfies FieldMapping's more general nullable types.
  if (mapping && mapping.sourceFieldId && mapping.targetFieldId) {
    emit('FieldMappingCreated', {
      sourceFieldId: mapping.sourceFieldId,
      targetFieldId: mapping.targetFieldId,
    })
  }
}

// PR #189 review: a target is covered by at most one coupling. Mapping a
// source onto a target that already carries one (source-bound or
// default-value) no longer silently creates a second coupling — it asks for
// explicit confirmation to replace the existing one first.
// Feature #194: alternative storage and regular couplings exclude each other
// on one source field, so coupling a source that goes to alternative storage
// asks to replace that first (`kind: 'source'`). If the chosen target is
// itself already coupled, that replacement is confirmed right after.
// Nothing is removed until the last replacement is confirmed: cancelling the
// second one leaves the first coupling in place too (PR #208 review).
const pendingReplace = ref<{
  kind: 'source' | 'target'
  existingId: string
  newSourceFieldId: string
  targetFieldId: string
  // Couplings whose replacement an earlier dialog already confirmed.
  confirmedIds: string[]
} | null>(null)

const pendingReplaceLabels = computed(() => {
  if (!pendingReplace.value) return null
  const { kind, existingId, newSourceFieldId, targetFieldId } = pendingReplace.value
  const existing = mappingsStore.mappings.find((m) => m.id === existingId)
  const target = props.targetSchema.byId(targetFieldId)
  const existingSource = existing?.sourceFieldId
    ? props.sourceSchema.byId(existing.sourceFieldId)
    : null
  const newSource = props.sourceSchema.byId(newSourceFieldId)
  const labels = {
    targetPath: target?.path ?? targetFieldId,
    existingSourcePath: existingSource?.path ?? existing?.sourceFieldId ?? '—',
    newSourcePath: newSource?.path ?? newSourceFieldId,
  }
  if (kind === 'target') return { ...labels, existingTargetPath: undefined, intro: undefined }
  const name = existing ? (alternativeStorageName(existing) ?? '—') : '—'
  return {
    ...labels,
    existingTargetPath: `Alternatieve opslag: ${name}`,
    intro: 'Dit bronveld gaat naar alternatieve opslag:',
  }
})

// Couple `sourceFieldId` to `targetFieldId`, first asking to replace whatever
// stands in the way: the source's alternative-storage coupling, then the
// target's existing coupling. `confirmedIds` are already confirmed for
// replacement; they are removed only once nothing else stands in the way.
function requestCoupling(
  sourceFieldId: string,
  targetFieldId: string,
  confirmedIds: string[] = [],
) {
  const remaining = mappingsStore.mappings.filter((m) => !confirmedIds.includes(m.id))
  const alternative = remaining.find(
    (m) => m.sourceFieldId === sourceFieldId && m.targetFieldId === null,
  )
  const existing = alternative ?? remaining.find((m) => m.targetFieldId === targetFieldId)
  if (existing) {
    pendingReplace.value = {
      kind: alternative ? 'source' : 'target',
      existingId: existing.id,
      newSourceFieldId: sourceFieldId,
      targetFieldId,
      confirmedIds,
    }
    return
  }
  for (const id of confirmedIds) mappingsStore.removeMapping(id)
  createMappingAndEmit(sourceFieldId, targetFieldId)
}

function onTargetFieldClick(fieldId: string) {
  if (!selectedSourceId.value) return
  const sourceFieldId = selectedSourceId.value
  selectedSourceId.value = null
  requestCoupling(sourceFieldId, fieldId)
}

function confirmReplaceCoupling() {
  if (!pendingReplace.value) return
  const { existingId, newSourceFieldId, targetFieldId, confirmedIds } = pendingReplace.value
  pendingReplace.value = null
  requestCoupling(newSourceFieldId, targetFieldId, [...confirmedIds, existingId])
}

function cancelReplaceCoupling() {
  pendingReplace.value = null
}

// Feature #163: double-clicking an unmapped target field opens a confirmation
// dialogue before creating a source-less ("default-value") coupling. A
// target that already carries any coupling just selects it instead (Edge
// Case: "Target field already has a coupling").
const pendingDefaultValueFieldId = ref<string | null>(null)
const pendingDefaultValueField = computed(() =>
  pendingDefaultValueFieldId.value
    ? (props.targetSchema.byId(pendingDefaultValueFieldId.value) ?? null)
    : null,
)

function onTargetFieldDoubleClick(fieldId: string) {
  const existing = mappingsStore.mappings.find((m) => m.targetFieldId === fieldId)
  if (existing) {
    mappingsStore.selectMapping(existing.id)
    return
  }
  pendingDefaultValueFieldId.value = fieldId
}

function confirmDefaultValueCoupling() {
  const fieldId = pendingDefaultValueFieldId.value
  if (!fieldId) return
  const created = mappingsStore.createDefaultValueCoupling({ targetFieldId: fieldId })
  if (created) mappingsStore.selectMapping(created.id)
  pendingDefaultValueFieldId.value = null
}

function cancelDefaultValueCoupling() {
  pendingDefaultValueFieldId.value = null
}

// Feature #194: double-clicking an unmapped source field opens a confirmation
// dialogue before creating a target-less ("alternative-storage") coupling —
// the mirror of the default-value flow above. A source that already carries
// any coupling just selects it instead.
const pendingAlternativeStorageFieldId = ref<string | null>(null)
const pendingAlternativeStorageField = computed(() =>
  pendingAlternativeStorageFieldId.value
    ? (props.sourceSchema.byId(pendingAlternativeStorageFieldId.value) ?? null)
    : null,
)

function onSourceFieldDoubleClick(fieldId: string) {
  // A real double-click first fires two clicks, which toggled the manual
  // mapping selection — a double-click never starts a manual mapping.
  selectedSourceId.value = null
  const existing = mappingsStore.mappings.find((m) => m.sourceFieldId === fieldId)
  if (existing) {
    mappingsStore.selectMapping(existing.id)
    return
  }
  pendingAlternativeStorageFieldId.value = fieldId
}

function confirmAlternativeStorageCoupling() {
  const fieldId = pendingAlternativeStorageFieldId.value
  if (!fieldId) return
  const created = mappingsStore.createAlternativeStorageCoupling({ sourceFieldId: fieldId })
  if (created) mappingsStore.selectMapping(created.id)
  pendingAlternativeStorageFieldId.value = null
}

function cancelAlternativeStorageCoupling() {
  pendingAlternativeStorageFieldId.value = null
}

function onSourceFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('SourceFileSelected', file)
}

// TODO(production): remove temporary default link
const sourceUrlInput = ref(
  'https://raw.githubusercontent.com/NL-AMS-LOCGOV/esuite-data-extractie/refs/heads/main/openapi-spec/OpenAPI.yaml',
)

function onSourceUrlSubmit() {
  const url = sourceUrlInput.value.trim()
  if (url) emit('SourceUrlEntered', url)
}

function onTargetFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) emit('TargetFileSelected', file)
}

// TODO(production): remove temporary default link
const targetUrlInput = ref('https://openzaak.dev.kiss-demo.nl/zaken/api/v1/openapi.json')

function onTargetUrlSubmit() {
  const url = targetUrlInput.value.trim()
  if (url) emit('TargetUrlEntered', url)
}
</script>

<template>
  <div class="w-full h-full flex flex-col bg-slate-100">
    <!-- Two-panel layout -->
    <div class="relative flex-1 flex overflow-hidden gap-12">
      <!-- Source column -->
      <div
        ref="sourceColumnRef"
        class="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-sm"
        data-testid="source-column"
      >
        <SchemaColumnHeader
          v-if="sourceLabel"
          :data="{ label: sourceLabel, side: 'source' }"
          :counter="sourceCounter"
        />

        <!-- No eligible schemas after spec load -->
        <div
          v-if="
            sourceEligibleSchemaNames !== null &&
            sourceEligibleSchemaNames !== undefined &&
            sourceEligibleSchemaNames.length === 0
          "
          class="flex-1 flex items-center justify-center p-6 text-sm text-slate-400 text-center"
          data-testid="source-no-schemas"
        >
          Geen bronschema's gevonden voor leesoperaties (GET). Controleer of de specificatie
          GET-operaties bevat.
        </div>

        <!-- Upload UI when no source schema loaded -->
        <div
          v-else-if="sourceSchema.all().length === 0 && !sourceEligibleSchemaNames?.length"
          class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center"
          data-testid="source-upload"
        >
          <p class="text-sm text-slate-400">Laad een bronschema (OpenAPI YAML of JSON)</p>

          <!-- File picker -->
          <label
            class="cursor-pointer px-3 py-1.5 text-sm rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            Bestand kiezen
            <input
              type="file"
              accept=".yaml,.yml,.json"
              class="sr-only"
              data-testid="source-file-input"
              @change="onSourceFileChange"
            />
          </label>

          <span class="text-xs text-slate-300">of</span>

          <!-- URL input -->
          <form class="flex gap-2 w-full max-w-xs" @submit.prevent="onSourceUrlSubmit">
            <input
              v-model="sourceUrlInput"
              type="url"
              placeholder="https://api.example.com/openapi.json"
              class="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-blue-400"
              data-testid="source-url-input"
            />
            <button
              type="submit"
              class="shrink-0 px-2 py-1.5 text-xs rounded bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
              data-testid="source-url-submit"
            >
              Laden
            </button>
          </form>
        </div>

        <!-- Field tree -->
        <SourceSchemaPanel
          v-else
          ref="sourcePanelRef"
          class="flex-1 overflow-y-auto"
          data-scroll-container
          :schema="sourceSchema"
          side="source"
          :selected-field-id="selectedSourceId"
          @field-click="onSourceFieldClick"
          @field-dblclick="onSourceFieldDoubleClick"
        />
      </div>

      <!-- Target column -->
      <div
        ref="targetColumnRef"
        class="flex-1 flex flex-col overflow-hidden bg-white border border-slate-200 rounded-sm"
        data-testid="target-column"
      >
        <SchemaColumnHeader
          v-if="targetLabel"
          :data="{ label: targetLabel, side: 'target' }"
          :counter="targetCounter"
        />

        <!-- No eligible schemas after spec load -->
        <div
          v-if="
            targetEligibleSchemaNames !== null &&
            targetEligibleSchemaNames !== undefined &&
            targetEligibleSchemaNames.length === 0
          "
          class="flex-1 flex items-center justify-center p-6 text-sm text-slate-400 text-center"
          data-testid="target-no-schemas"
        >
          Geen doelschema's gevonden voor schrijfoperaties (POST). Controleer of de specificatie
          POST-operaties bevat.
        </div>

        <!-- Upload UI when no target schema loaded -->
        <div
          v-else-if="targetSchema.all().length === 0 && !targetEligibleSchemaNames?.length"
          class="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center"
          data-testid="target-upload"
        >
          <p class="text-sm text-slate-400">Laad een doelschema (OpenAPI YAML of JSON)</p>

          <label
            class="cursor-pointer px-3 py-1.5 text-sm rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Bestand kiezen
            <input
              type="file"
              accept=".yaml,.yml,.json"
              class="sr-only"
              data-testid="target-file-input"
              @change="onTargetFileChange"
            />
          </label>

          <span class="text-xs text-slate-300">of</span>

          <form class="flex gap-2 w-full max-w-xs" @submit.prevent="onTargetUrlSubmit">
            <input
              v-model="targetUrlInput"
              type="url"
              placeholder="https://api.example.com/openapi.json"
              class="flex-1 min-w-0 text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-emerald-400"
              data-testid="target-url-input"
            />
            <button
              type="submit"
              class="shrink-0 px-2 py-1.5 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              data-testid="target-url-submit"
            >
              Laden
            </button>
          </form>
        </div>

        <!-- Field tree -->
        <SourceSchemaPanel
          v-else
          ref="targetPanelRef"
          class="flex-1 overflow-y-auto"
          data-scroll-container
          :schema="targetSchema"
          side="target"
          @field-click="onTargetFieldClick"
          @field-dblclick="onTargetFieldDoubleClick"
        />
      </div>

      <!-- SVG connection line overlay -->
      <ConnectionLines :source-schema="sourceSchema" :target-schema="targetSchema" />
    </div>

    <!-- Default-value coupling confirmation (Feature #163) -->
    <div
      v-if="pendingDefaultValueField"
      class="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
      data-testid="default-value-confirm-overlay"
    >
      <div class="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4">
        <DefaultValueConfirmDialog
          :field="pendingDefaultValueField"
          @close="cancelDefaultValueCoupling"
          @confirm="confirmDefaultValueCoupling"
        />
      </div>
    </div>

    <!-- Alternative-storage coupling confirmation (Feature #194) -->
    <div
      v-if="pendingAlternativeStorageField"
      class="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
      data-testid="alternative-storage-confirm-overlay"
    >
      <div class="bg-white rounded-lg shadow-lg max-w-sm w-full mx-4">
        <AlternativeStorageConfirmDialog
          :field="pendingAlternativeStorageField"
          @close="cancelAlternativeStorageCoupling"
          @confirm="confirmAlternativeStorageCoupling"
        />
      </div>
    </div>

    <!-- Replace-coupling confirmation (PR #189 review) -->
    <div
      v-if="pendingReplaceLabels"
      class="fixed inset-0 flex items-center justify-center bg-black/20 z-50"
      data-testid="replace-coupling-confirm-overlay"
    >
      <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        <ReplaceCouplingConfirmDialog
          :target-path="pendingReplaceLabels.targetPath"
          :existing-source-path="pendingReplaceLabels.existingSourcePath"
          :new-source-path="pendingReplaceLabels.newSourcePath"
          :existing-target-path="pendingReplaceLabels.existingTargetPath"
          :intro="pendingReplaceLabels.intro"
          @close="cancelReplaceCoupling"
          @confirm="confirmReplaceCoupling"
        />
      </div>
    </div>
  </div>
</template>
