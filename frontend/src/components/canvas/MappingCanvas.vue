<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { Schema } from '@/domain/schema'
import SourceSchemaPanel from './SourceSchemaPanel.vue'
import SchemaColumnHeader from './SchemaColumnHeader.vue'
import ConnectionLines from './ConnectionLines.vue'
import { useMappings } from '@/composables/useMappings'
import { useAISuggestions } from '@/composables/useAISuggestions'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
  sourceLabel?: string
  targetLabel?: string
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
  sourcePanelRef.value?.scrollToField(mapping.sourceFieldId)
  targetPanelRef.value?.scrollToField(mapping.targetFieldId)
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
  const mappedIds = new Set(mappingsStore.mappings.map((m) => m.sourceFieldId))
  return { mapped: mappedIds.size, total: props.sourceSchema.all().length }
})

const targetCounter = computed(() => {
  const mappedTargetIds = new Set(mappingsStore.mappings.map((m) => m.targetFieldId))
  return {
    mapped: props.targetSchema.all().filter((f) => mappedTargetIds.has(f.id)).length,
    total: props.targetSchema.all().length,
  }
})

function onSourceFieldClick(fieldId: string) {
  selectedSourceId.value = selectedSourceId.value === fieldId ? null : fieldId
}

function onTargetFieldClick(fieldId: string) {
  if (!selectedSourceId.value) return

  const mapping = mappingsStore.createMapping({
    sourceFieldId: selectedSourceId.value,
    targetFieldId: fieldId,
    schemas: { source: props.sourceSchema, target: props.targetSchema },
  })

  if (mapping) {
    emit('FieldMappingCreated', {
      sourceFieldId: mapping.sourceFieldId,
      targetFieldId: mapping.targetFieldId,
    })
  }

  selectedSourceId.value = null
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

        <!-- Upload UI when no source schema loaded -->
        <div
          v-if="sourceSchema.all().length === 0"
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

        <!-- Upload UI when no target schema loaded -->
        <div
          v-if="targetSchema.all().length === 0"
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
        />
      </div>

      <!-- SVG connection line overlay -->
      <ConnectionLines />
    </div>
  </div>
</template>
