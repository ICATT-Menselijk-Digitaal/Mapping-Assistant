import { defineStore } from 'pinia'
import { ref } from 'vue'
import router from '@/router'

export type KoppelingenTab = 'koppelingen' | 'ai'

export const usePanelDetach = defineStore('panelDetach', () => {
  const koppelingenPanelDetached = ref(false)
  const koppelingenPanelPopupBlocked = ref(false)
  const mainWindowClosed = ref(false)
  const activeTab = ref<KoppelingenTab>('koppelingen')

  function detachKoppelingenPanel(): boolean {
    const url = router.resolve({ name: 'panel-koppelingen' }).href
    const win = window.open(url, '_blank', 'width=900,height=900')
    if (!win) {
      koppelingenPanelPopupBlocked.value = true
      return false
    }
    koppelingenPanelPopupBlocked.value = false
    koppelingenPanelDetached.value = true
    return true
  }

  function onKoppelingenPanelReattached(): void {
    koppelingenPanelDetached.value = false
  }

  function onMainWindowClosed(): void {
    mainWindowClosed.value = true
  }

  return {
    koppelingenPanelDetached,
    koppelingenPanelPopupBlocked,
    mainWindowClosed,
    activeTab,
    detachKoppelingenPanel,
    onKoppelingenPanelReattached,
    onMainWindowClosed,
  }
})
