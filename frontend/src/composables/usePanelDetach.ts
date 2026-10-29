import { defineStore } from 'pinia'
import { ref } from 'vue'
import router from '@/router'

export const usePanelDetach = defineStore('panelDetach', () => {
  const schemaPanelDetached = ref(false)
  const koppelingenPanelDetached = ref(false)
  const schemaPanelPopupBlocked = ref(false)
  const koppelingenPanelPopupBlocked = ref(false)
  const mainWindowClosed = ref(false)

  function detachSchemaPanel(): boolean {
    const url = router.resolve({ name: 'panel-schema' }).href
    const win = window.open(url, '_blank', 'width=1400,height=900')
    if (!win) {
      schemaPanelPopupBlocked.value = true
      return false
    }
    schemaPanelPopupBlocked.value = false
    schemaPanelDetached.value = true
    return true
  }

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

  function onSchemaPanelReattached(): void {
    schemaPanelDetached.value = false
    // Notify ConnectionLines to recalculate (reuses the existing toggle event).
    window.dispatchEvent(new Event('schema-panel-toggle'))
  }

  function onKoppelingenPanelReattached(): void {
    koppelingenPanelDetached.value = false
  }

  function onMainWindowClosed(): void {
    mainWindowClosed.value = true
  }

  return {
    schemaPanelDetached,
    koppelingenPanelDetached,
    schemaPanelPopupBlocked,
    koppelingenPanelPopupBlocked,
    mainWindowClosed,
    detachSchemaPanel,
    detachKoppelingenPanel,
    onSchemaPanelReattached,
    onKoppelingenPanelReattached,
    onMainWindowClosed,
  }
})
