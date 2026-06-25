<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import MappingCanvas from '@/components/canvas/MappingCanvas.vue'
import MappingOverview from '@/components/canvas/MappingOverview.vue'
import CouplingDetailPanel from '@/components/canvas/CouplingDetailPanel.vue'
import ExportButton from '@/components/ExportButton.vue'
import ImportButton from '@/components/ImportButton.vue'
import WorkspaceCode from '@/components/WorkspaceCode.vue'
import RemoteUpdateBanner from '@/components/RemoteUpdateBanner.vue'
import { loadAll, startSync, stopSync } from '@/api/sync'
import { useSourceSchema } from '@/composables/useSourceSchema'
import { useTargetSchema } from '@/composables/useTargetSchema'
import { useMappings } from '@/composables/useMappings'
import { useWorkspace } from '@/composables/useWorkspace'
import { useImport } from '@/composables/useImport'

const source = useSourceSchema()
const target = useTargetSchema()
const {
  schema: sourceSchema,
  sourceUrl: sourceSchemaUrl,
  error: sourceError,
  loadFromFile: loadSourceFromFile,
  loadFromUrl: loadSourceFromUrl,
} = source
const {
  schema: targetSchema,
  sourceUrl: targetSchemaUrl,
  error: targetError,
  loadFromFile: loadTargetFromFile,
  loadFromUrl: loadTargetFromUrl,
} = target
const mappingsStore = useMappings()
const workspace = useWorkspace()
const {
  importMappingSet,
  error: importError,
  warnings: importWarnings,
  clearError: clearImportError,
  clearWarnings: clearImportWarnings,
} = useImport()

const activeTab = ref<'koppelingen' | 'ai'>('koppelingen')

// Hydrate every resource and start polling for cross-device updates. Data
// orchestration lives in the data layer (loadAll + the workspace store re-loads
// on code change), so the view only loads on mount, polls while visible, and
// resets its own selection when the workspace changes.
let mounted = true
onMounted(async () => {
  await loadAll()
  // If the view unmounted while loadAll() was in flight, onUnmounted already ran
  // stopSync() — don't start an orphaned polling interval here.
  if (mounted) startSync()
})
onUnmounted(() => {
  mounted = false
  stopSync()
})
watch(
  () => workspace.code,
  () => {
    mappingsStore.selectMapping(null)
    // Fresh workspace hydrates fresh schemas; drop any stale load error so the
    // red banner from the previous workspace doesn't linger.
    sourceError.value = null
    targetError.value = null
  },
)

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
      v-if="sourceError || targetError"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg shadow"
      data-testid="schema-error"
    >
      {{ sourceError || targetError }}
    </div>
    <div class="flex-1 min-w-0 flex flex-col gap-2 min-h-0">
      <div class="flex-1 min-h-0">
        <MappingCanvas
          :source-schema="sourceSchema"
          :target-schema="targetSchema"
          :source-label="sourceSchema.name || 'Bronschema'"
          :target-label="targetSchema.name || 'Doelschema'"
          @source-file-selected="onSourceFileSelected"
          @source-url-entered="onSourceUrlEntered"
          @target-file-selected="onTargetFileSelected"
          @target-url-entered="onTargetUrlEntered"
        />
      </div>
    </div>
    <div class="w-80 shrink-0 h-full overflow-hidden">
      <CouplingDetailPanel
        v-if="mappingsStore.selectedMappingId !== null"
        :source-schema="sourceSchema"
        :target-schema="targetSchema"
      />
      <MappingOverview
        v-else
        v-model:active-tab="activeTab"
        :source-schema="sourceSchema"
        :target-schema="targetSchema"
      />
    </div>
    <div class="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      <RemoteUpdateBanner />
      <WorkspaceCode />
      <ImportButton
        :error="importError"
        :warnings="importWarnings"
        @file-selected="onImportFileSelected"
        @dismiss-error="clearImportError"
        @dismiss-warnings="clearImportWarnings"
      />
      <ExportButton
        :source-schema="sourceSchema"
        :target-schema="targetSchema"
        :source-url="sourceSchemaUrl"
        :target-url="targetSchemaUrl"
      />
    </div>
  </main>
</template>
