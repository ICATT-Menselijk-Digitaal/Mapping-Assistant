<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
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

// Set by the main window when it opens this one. Without it (URL opened by
// hand) this window gets its own session, so it syncs with no main window.
const route = useRoute()
const sessionQuery = route.query.session
const panelSessionId =
  typeof sessionQuery === 'string' && sessionQuery ? sessionQuery : crypto.randomUUID()

// "Terugplaatsen" is unambiguous, unlike the beforeunload goodbye (which also
// fires on a reload), so the main window can take the panel back right away.
function onReattach(): void {
  panelSync.broadcast({ type: 'KoppelingenPanelReattached' })
  window.close()
}

onMounted(async () => {
  await loadAll()
  panelSync.init({ sessionId: panelSessionId, role: 'koppelingen-panel' })
})

onUnmounted(() => {
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
        detach-label="Terugplaatsen"
        class="h-full"
        @detach="onReattach"
      />
    </div>
  </main>
</template>
