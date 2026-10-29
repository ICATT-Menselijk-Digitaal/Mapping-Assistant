<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
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
import { usePanelDetach } from '@/composables/usePanelDetach'
import { usePanelSync } from '@/composables/usePanelSync'

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

const panelDetach = usePanelDetach()
const panelSync = usePanelSync()

const activeTab = ref<'koppelingen' | 'ai'>('koppelingen')
const { koppelingenWidthPct, setKoppelingenWidthPct, persistKoppelingenWidthPct } = usePanelWidth()
const STORAGE_WARN_THRESHOLD = 0.8

const storageUnavailable = ref(false)
const storageInfo = ref<StorageInfo | null>(null)
const storageNearlyFull = computed(() => (storageInfo.value?.ratio ?? 0) >= STORAGE_WARN_THRESHOLD)
const storageWriteError = computed(() => getRegistry().some((r) => r.error.value))

const showBothPanels = computed(
  () => !panelDetach.schemaPanelDetached && !panelDetach.koppelingenPanelDetached,
)
const showOnlySchema = computed(
  () => !panelDetach.schemaPanelDetached && panelDetach.koppelingenPanelDetached,
)
const showOnlyKoppelingen = computed(
  () => panelDetach.schemaPanelDetached && !panelDetach.koppelingenPanelDetached,
)
const bothDetached = computed(
  () => panelDetach.schemaPanelDetached && panelDetach.koppelingenPanelDetached,
)

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

function onBeforeUnload(): void {
  panelSync.broadcast({ type: 'MainWindowClosed' })
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  storageUnavailable.value = !(await isStorageAvailable())
  await loadAll()
  storageInfo.value = await getStorageInfo()
  panelSync.init()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  panelSync.destroy()
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
    <!-- Storage and schema error banners -->
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

    <!-- Both panels present: use resizable split -->
    <ResizableSplit
      v-if="showBothPanels"
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
          <div class="flex justify-end">
            <button
              class="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-200"
              :title="'Schemapaneel loskoppelen naar apart venster'"
              data-testid="detach-schema-panel"
              @click="panelDetach.detachSchemaPanel()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0110.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                  clip-rule="evenodd"
                />
                <path
                  fill-rule="evenodd"
                  d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                  clip-rule="evenodd"
                />
              </svg>
              Loskoppelen
            </button>
          </div>
          <div
            v-if="panelDetach.schemaPanelPopupBlocked"
            class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
            data-testid="schema-panel-popup-blocked"
          >
            Pop-upvenster geblokkeerd. Sta pop-ups toe voor deze pagina en probeer opnieuw.
          </div>
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
          <div class="flex justify-end">
            <button
              class="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-200"
              :title="'Koppelingspaneel loskoppelen naar apart venster'"
              data-testid="detach-koppelingen-panel"
              @click="panelDetach.detachKoppelingenPanel()"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-3.5 h-3.5"
                aria-hidden="true"
              >
                <path
                  fill-rule="evenodd"
                  d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0110.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
                  clip-rule="evenodd"
                />
                <path
                  fill-rule="evenodd"
                  d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
                  clip-rule="evenodd"
                />
              </svg>
              Loskoppelen
            </button>
          </div>
          <div
            v-if="panelDetach.koppelingenPanelPopupBlocked"
            class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
            data-testid="koppelingen-panel-popup-blocked"
          >
            Pop-upvenster geblokkeerd. Sta pop-ups toe voor deze pagina en probeer opnieuw.
          </div>
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

    <!-- Only schema panel (Koppelingspaneel detached) -->
    <div v-else-if="showOnlySchema" class="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
      <div class="flex justify-end">
        <button
          class="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-200"
          :title="'Schemapaneel loskoppelen naar apart venster'"
          data-testid="detach-schema-panel"
          @click="panelDetach.detachSchemaPanel()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0110.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
              clip-rule="evenodd"
            />
            <path
              fill-rule="evenodd"
              d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
              clip-rule="evenodd"
            />
          </svg>
          Loskoppelen
        </button>
      </div>
      <div
        v-if="panelDetach.schemaPanelPopupBlocked"
        class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
        data-testid="schema-panel-popup-blocked"
      >
        Pop-upvenster geblokkeerd. Sta pop-ups toe voor deze pagina en probeer opnieuw.
      </div>
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

    <!-- Only Koppelingspaneel (schema panel detached) -->
    <div v-else-if="showOnlyKoppelingen" class="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
      <div class="flex justify-end">
        <button
          class="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-200"
          :title="'Koppelingspaneel loskoppelen naar apart venster'"
          data-testid="detach-koppelingen-panel"
          @click="panelDetach.detachKoppelingenPanel()"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0110.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
              clip-rule="evenodd"
            />
            <path
              fill-rule="evenodd"
              d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553l-9.056 8.194a.75.75 0 00-.053 1.06z"
              clip-rule="evenodd"
            />
          </svg>
          Loskoppelen
        </button>
      </div>
      <div
        v-if="panelDetach.koppelingenPanelPopupBlocked"
        class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1"
        data-testid="koppelingen-panel-popup-blocked"
      >
        Pop-upvenster geblokkeerd. Sta pop-ups toe voor deze pagina en probeer opnieuw.
      </div>
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

    <!-- Both panels detached -->
    <div
      v-else-if="bothDetached"
      class="flex-1 flex flex-col items-center justify-center gap-4 text-slate-400"
      data-testid="both-panels-detached"
    >
      <p class="text-sm">Beide panelen zijn lossgekoppeld naar aparte vensters.</p>
      <div class="flex flex-col items-end gap-2">
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
  </main>
</template>
