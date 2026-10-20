<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Schema } from '@/domain/schema'
import { useExport } from '@/composables/useExport'
import { downloadAsJson } from '@/utils/downloadHelper'
import type { ExportMetadata } from '@/utils/exportSerializer'

const props = defineProps<{
  sourceSchema: Schema
  targetSchema: Schema
  sourceUrl: string | null
  targetUrl: string | null
}>()

const { exportMappingSet } = useExport()

const canExport = computed(
  () => props.sourceSchema.all().length > 0 && props.targetSchema.all().length > 0,
)

// Same look as the import toast in ImportButton.vue, but stays longer so the
// version and time can be read. Kept as a local copy on purpose; shared pop-up
// templates are a planned refactor.
const AUTO_DISMISS_MS = 8000
const lastExport = ref<ExportMetadata | null>(null)
let dismissTimer: ReturnType<typeof setTimeout> | null = null

const confirmation = computed(() => {
  if (!lastExport.value) return null
  const when = new Date(lastExport.value.exportedAt).toLocaleString('nl-NL', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return `Koppelingsset geëxporteerd: versie ${lastExport.value.exportVersion} · ${when}`
})

function showConfirmation(metadata: ExportMetadata) {
  lastExport.value = metadata
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = setTimeout(dismissConfirmation, AUTO_DISMISS_MS)
}

function dismissConfirmation() {
  if (dismissTimer) clearTimeout(dismissTimer)
  dismissTimer = null
  lastExport.value = null
}

onBeforeUnmount(() => {
  if (dismissTimer) clearTimeout(dismissTimer)
})

function handleExport() {
  const payload = exportMappingSet(
    { schema: props.sourceSchema, sourceUrl: props.sourceUrl },
    { schema: props.targetSchema, sourceUrl: props.targetUrl },
  )
  const date = new Date().toISOString().slice(0, 10)
  downloadAsJson(payload, `koppelingsset-${date}.json`)
  showConfirmation(payload.metadata)
}
</script>

<template>
  <div class="relative">
    <button
      :disabled="!canExport"
      class="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg shadow-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
      :title="!canExport ? 'Laad eerst een bron- en doelschema' : undefined"
      @click="handleExport"
    >
      Exporteer koppelingsset
    </button>
    <!-- Beside the button that triggered it; above it would cover the import button. -->
    <div
      v-if="confirmation"
      class="absolute right-full bottom-0 mr-2 z-50 whitespace-nowrap text-sm bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg shadow-lg flex items-center gap-3"
      role="status"
      data-testid="export-toast"
    >
      <span>✓ {{ confirmation }}</span>
      <button
        type="button"
        class="text-emerald-500 hover:text-emerald-700 font-bold leading-none"
        aria-label="Sluiten"
        data-testid="export-toast-dismiss"
        @click="dismissConfirmation"
      >
        ×
      </button>
    </div>
  </div>
</template>
