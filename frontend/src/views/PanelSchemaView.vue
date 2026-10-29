<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import MappingCanvas from '@/components/canvas/MappingCanvas.vue'
import { useSchemaSide } from '@/composables/useSchemaSide'
import { usePanelSync } from '@/composables/usePanelSync'
import { usePanelDetach } from '@/composables/usePanelDetach'
import { loadAll } from '@/api/resources'

const source = useSchemaSide('source')
const target = useSchemaSide('target')
const panelSync = usePanelSync()
const panelDetach = usePanelDetach()

const {
  displayedSchema: sourceDisplayedSchema,
  eligibleSchemaNames: sourceEligibleSchemaNames,
  loadFromFile: loadSourceFromFile,
  loadFromUrl: loadSourceFromUrl,
} = source

const {
  displayedSchema: targetDisplayedSchema,
  eligibleSchemaNames: targetEligibleSchemaNames,
  loadFromFile: loadTargetFromFile,
  loadFromUrl: loadTargetFromUrl,
} = target

function onBeforeUnload(): void {
  panelSync.broadcast({ type: 'SchemaPanelReattached' })
}

onMounted(async () => {
  window.addEventListener('beforeunload', onBeforeUnload)
  await loadAll()
  panelSync.init()
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
  panelSync.destroy()
})
</script>

<template>
  <main class="flex flex-col h-screen bg-slate-100 overflow-hidden">
    <div
      v-if="panelDetach.mainWindowClosed"
      class="shrink-0 bg-amber-50 border-b border-amber-200 text-amber-700 text-sm px-4 py-2 text-center"
      data-testid="main-window-closed-banner"
    >
      Het hoofdvenster is gesloten. Sluit dit venster om door te gaan.
    </div>
    <div class="flex-1 min-h-0 p-4">
      <MappingCanvas
        class="h-full"
        :source-schema="sourceDisplayedSchema"
        :target-schema="targetDisplayedSchema"
        :source-label="sourceDisplayedSchema.name || 'Bronschema'"
        :target-label="targetDisplayedSchema.name || 'Doelschema'"
        :source-eligible-schema-names="sourceEligibleSchemaNames"
        :target-eligible-schema-names="targetEligibleSchemaNames"
        @source-file-selected="loadSourceFromFile"
        @source-url-entered="loadSourceFromUrl"
        @target-file-selected="loadTargetFromFile"
        @target-url-entered="loadTargetFromUrl"
      />
    </div>
  </main>
</template>
