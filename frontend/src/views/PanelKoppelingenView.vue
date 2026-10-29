<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import MappingOverview from '@/components/canvas/MappingOverview.vue'
import CouplingDetailPanel from '@/components/canvas/CouplingDetailPanel.vue'
import { useSchemaSide } from '@/composables/useSchemaSide'
import { useMappings } from '@/composables/useMappings'
import { usePanelSync } from '@/composables/usePanelSync'
import { usePanelDetach } from '@/composables/usePanelDetach'
import { loadAll } from '@/api/resources'

const source = useSchemaSide('source')
const target = useSchemaSide('target')
const mappingsStore = useMappings()
const panelSync = usePanelSync()
const panelDetach = usePanelDetach()

const { displayedSchema: sourceDisplayedSchema } = source
const { displayedSchema: targetDisplayedSchema } = target

const activeTab = ref<'koppelingen' | 'ai'>('koppelingen')

function onBeforeUnload(): void {
  panelSync.broadcast({ type: 'KoppelingenPanelReattached' })
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
      <CouplingDetailPanel
        v-if="mappingsStore.selectedMappingId !== null"
        :source-schema="sourceDisplayedSchema"
        :target-schema="targetDisplayedSchema"
        class="h-full"
      />
      <MappingOverview
        v-else
        v-model:active-tab="activeTab"
        :source-schema="sourceDisplayedSchema"
        :target-schema="targetDisplayedSchema"
        class="h-full"
      />
    </div>
  </main>
</template>
