<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import MappingCanvas from '@/components/canvas/MappingCanvas.vue'
import MappingOverview from '@/components/canvas/MappingOverview.vue'
import CouplingDetailPanel from '@/components/canvas/CouplingDetailPanel.vue'
import ExportButton from '@/components/ExportButton.vue'
import ImportButton from '@/components/ImportButton.vue'
import ResizableSplit from '@/components/ResizableSplit.vue'
import { loadAll } from '@/api/resources'
import { getRegistry } from '@/api/resource'
import { isStorageAvailable, getStorageInfo, type StorageInfo } from '@/api/localBackend'
import { useSchemaSide } from '@/composables/useSchemaSide'
import { useMappings } from '@/composables/useMappings'
import { useImport } from '@/composables/useImport'
import { usePanelWidth } from '@/composables/usePanelWidth'

const source = useSchemaSide('source')
const target = useSchemaSide('target')
const {
  displayedSchema: sourceDisplayedSchema,
  eligibleSchemaNames: sourceEligibleSchemaNames,
  sourceUrl: sourceSchemaUrl,
  error: sourceError,
  loadFromFile: loadSourceFromFile,
  loadFromUrl: loadSourceFromUrl,
} = source
const {
  displayedSchema: targetDisplayedSchema,
  eligibleSchemaNames: targetEligibleSchemaNames,
  sourceUrl: targetSchemaUrl,
  error: targetError,
  loadFromFile: loadTargetFromFile,
  loadFromUrl: loadTargetFromUrl,
} = target
const mappingsStore = useMappings()
const {
  importMappingSet,
  error: importError,
  warnings: importWarnings,
  clearError: clearImportError,
  clearWarnings: clearImportWarnings,
} = useImport()

const activeTab = ref<'koppelingen' | 'ai'>('koppelingen')
const { koppelingenWidthPct, setKoppelingenWidthPct, persistKoppelingenWidthPct } = usePanelWidth()
const STORAGE_WARN_THRESHOLD = 0.8

const storageUnavailable = ref(false)
const storageInfo = ref<StorageInfo | null>(null)
const storageNearlyFull = computed(() => (storageInfo.value?.ratio ?? 0) >= STORAGE_WARN_THRESHOLD)
const storageWriteError = computed(() => getRegistry().some((r) => r.error.value))

// Feature #154: ConnectionLines.vue already recalculates on this event
// (used today for collapse/expand); reusing it here means a resize-drag
// needs no new listener wired into that file.
function notifySchemaPanelResized(): void {
  window.dispatchEvent(new Event('schema-panel-toggle'))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

onMounted(async () => {
  storageUnavailable.value = !(await isStorageAvailable())
  await loadAll()
  storageInfo.value = await getStorageInfo()
})

async function onSourceFileSelected(file: File) {
  await loadSourceFromFile(file)
}
async function onSourceUrlEntered(url: string) {
  await loadSourceFromUrl(url)
}
async function onTargetFileSelected(file: File) {
  await loadTargetFromFile(file)
}
async function onTargetUrlEntered(url: string) {
  await loadTargetFromUrl(url)
}
async function onImportFileSelected(file: File) {
  await importMappingSet(file, source, target)
}
</script>

<template>
  <main class="flex h-full gap-4 p-4 bg-slate-100 overflow-hidden">
    <div
      v-if="storageUnavailable"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2 rounded-lg shadow"
      data-testid="storage-unavailable-banner"
    >
      Lokale opslag is niet beschikbaar. Wijzigingen worden niet bewaard na het sluiten van de
      browser.
    </div>
    <div
      v-if="storageWriteError"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow"
      data-testid="storage-write-error-banner"
    >
      Lokale opslag is vol. Wijzigingen worden niet bewaard. Verwijder browsergegevens of gebruik
      een andere browser.
    </div>
    <div
      v-if="storageNearlyFull && !storageWriteError"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-200 text-amber-700 text-sm px-4 py-2 rounded-lg shadow"
      data-testid="storage-nearly-full-banner"
    >
      Lokale opslag raakt vol ({{ formatBytes(storageInfo!.usage) }} van
      {{ formatBytes(storageInfo!.quota) }} gebruikt). Overweeg browsergegevens te verwijderen om
      ruimte vrij te maken.
    </div>
    <div
      v-if="sourceError || targetError"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow"
      data-testid="schema-error"
    >
      {{ sourceError || targetError }}
    </div>
    <ResizableSplit
      class="flex-1 min-w-0 min-h-0"
      :right-width-pct="koppelingenWidthPct"
      :min-left-px="480"
      :min-right-px="280"
      @update:right-width-pct="setKoppelingenWidthPct"
      @resizing="notifySchemaPanelResized"
      @resize-end="persistKoppelingenWidthPct"
    >
      <template #left>
        <div class="flex flex-col gap-2 h-full min-h-0 pr-2">
          <div class="flex-1 min-h-0">
            <MappingCanvas
              :source-schema="sourceDisplayedSchema"
              :target-schema="targetDisplayedSchema"
              :source-label="sourceDisplayedSchema.name || 'Bronschema'"
              :target-label="targetDisplayedSchema.name || 'Doelschema'"
              :source-eligible-schema-names="sourceEligibleSchemaNames"
              :target-eligible-schema-names="targetEligibleSchemaNames"
              @source-file-selected="onSourceFileSelected"
              @source-url-entered="onSourceUrlEntered"
              @target-file-selected="onTargetFileSelected"
              @target-url-entered="onTargetUrlEntered"
            />
          </div>
        </div>
      </template>
      <template #right>
        <div class="flex flex-col gap-2 h-full min-h-0 pl-2">
          <CouplingDetailPanel
            v-if="mappingsStore.selectedMappingId !== null"
            :source-schema="sourceDisplayedSchema"
            :target-schema="targetDisplayedSchema"
            class="flex-1 min-h-0"
          />
          <MappingOverview
            v-else
            v-model:active-tab="activeTab"
            :source-schema="sourceDisplayedSchema"
            :target-schema="targetDisplayedSchema"
            class="flex-1 min-h-0"
          />
          <div class="shrink-0 flex flex-col items-end gap-2">
            <ImportButton
              :error="importError"
              :warnings="importWarnings"
              @file-selected="onImportFileSelected"
              @dismiss-error="clearImportError"
              @dismiss-warnings="clearImportWarnings"
            />
            <ExportButton
              :source-schema="sourceDisplayedSchema"
              :target-schema="targetDisplayedSchema"
              :source-url="sourceSchemaUrl"
              :target-url="targetSchemaUrl"
            />
          </div>
        </div>
      </template>
    </ResizableSplit>
  </main>
</template>
