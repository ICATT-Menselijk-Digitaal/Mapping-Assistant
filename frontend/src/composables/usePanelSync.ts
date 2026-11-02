import { defineStore } from 'pinia'
import { watch, nextTick } from 'vue'
import { useMappings } from './useMappings'
import { usePanelDetach } from './usePanelDetach'
import { sourceSchemaResource, targetSchemaResource } from '@/api/resources'

export type PanelSyncMessage =
  | { type: 'MappingsUpdated' }
  | { type: 'SourceSchemaUpdated' }
  | { type: 'TargetSchemaUpdated' }
  | { type: 'SelectionChanged'; mappingId: string | null }
  | { type: 'KoppelingenPanelReattached' }
  | { type: 'MainWindowClosed' }

export const PANEL_SYNC_CHANNEL = 'mapping-assistant'

export const usePanelSync = defineStore('panelSync', () => {
  let channel: BroadcastChannel | null = null
  // Prevents the window from re-broadcasting state it just received from
  // another window — avoids an infinite echo loop.
  let suppressBroadcast = false
  let initialized = false

  function broadcast(msg: PanelSyncMessage): void {
    channel?.postMessage(msg)
  }

  async function handleMessage(msg: PanelSyncMessage): Promise<void> {
    const mappingsStore = useMappings()
    const panelDetachStore = usePanelDetach()
    suppressBroadcast = true
    try {
      if (msg.type === 'MappingsUpdated') {
        await mappingsStore.load()
      } else if (msg.type === 'SourceSchemaUpdated') {
        await sourceSchemaResource.load()
      } else if (msg.type === 'TargetSchemaUpdated') {
        await targetSchemaResource.load()
      } else if (msg.type === 'SelectionChanged') {
        mappingsStore.selectMapping(msg.mappingId)
      } else if (msg.type === 'KoppelingenPanelReattached') {
        panelDetachStore.onKoppelingenPanelReattached()
      } else if (msg.type === 'MainWindowClosed') {
        panelDetachStore.onMainWindowClosed()
      }
    } finally {
      // Wait for Vue to flush all reactive updates triggered by the store
      // mutations above before clearing the flag, so the watchers below
      // see suppressBroadcast = true and skip the echo broadcast.
      await nextTick()
      suppressBroadcast = false
    }
  }

  function init(): void {
    if (initialized) return
    initialized = true

    channel = new BroadcastChannel(PANEL_SYNC_CHANNEL)
    channel.onmessage = (event: MessageEvent<PanelSyncMessage>) => {
      void handleMessage(event.data)
    }

    const mappingsStore = useMappings()

    // Persistent state: broadcast a reload notification so other windows
    // re-read from the shared IndexedDB. This avoids serialising Schema
    // instances (which have methods and are not structuredClone-safe).
    watch(
      () => mappingsStore.mappings,
      () => {
        if (suppressBroadcast) return
        broadcast({ type: 'MappingsUpdated' })
      },
    )

    watch(
      () => mappingsStore.selectedMappingId,
      (id) => {
        if (suppressBroadcast) return
        broadcast({ type: 'SelectionChanged', mappingId: id })
      },
    )

    watch(sourceSchemaResource.state, () => {
      if (suppressBroadcast) return
      broadcast({ type: 'SourceSchemaUpdated' })
    })

    watch(targetSchemaResource.state, () => {
      if (suppressBroadcast) return
      broadcast({ type: 'TargetSchemaUpdated' })
    })
  }

  function destroy(): void {
    channel?.close()
    channel = null
    initialized = false
    suppressBroadcast = false
  }

  return { broadcast, init, destroy }
})
