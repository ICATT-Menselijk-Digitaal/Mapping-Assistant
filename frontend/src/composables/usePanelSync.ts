import { defineStore } from 'pinia'
import { watch, nextTick, toRaw } from 'vue'
import { useMappings } from './useMappings'
import { usePanelDetach, type KoppelingenTab } from './usePanelDetach'
import { useAISuggestions } from './useAISuggestions'
import { sourceSchemaResource, targetSchemaResource } from '@/api/resources'
import type { AiSuggestion } from '@/types'

export type PanelSyncMessage =
  | { type: 'MappingsUpdated' }
  | { type: 'SourceSchemaUpdated' }
  | { type: 'TargetSchemaUpdated' }
  | { type: 'SelectionChanged'; mappingId: string | null }
  | { type: 'KoppelingenPanelOpened' }
  | { type: 'KoppelingenPanelUnloading' }
  | { type: 'KoppelingenPanelReattached' }
  | { type: 'MainWindowOpened' }
  | { type: 'MainWindowClosed' }
  | { type: 'ActiveTabChanged'; tab: KoppelingenTab }
  | { type: 'PanelReady' }
  | {
      type: 'AISuggestionsUpdated'
      suggestions: AiSuggestion[]
      lowConfidenceSuggestions: AiSuggestion[]
    }

/**
 * What actually goes over the channel. Every app window on this origin hears
 * every message, so each one carries the session id of the main window it
 * belongs to; windows ignore messages from other sessions (e.g. a second tab).
 */
export interface PanelSyncEnvelope {
  sessionId: string
  message: PanelSyncMessage
}

/** Which window this is: the main window or the detached Koppelingspaneel. */
export type PanelSyncRole = 'main' | 'koppelingen-panel'

export const PANEL_SYNC_CHANNEL = 'mapping-assistant'

const SESSION_STORAGE_KEY = 'ma_panel_sync_session_id'

function newSessionId(): string {
  return crypto.randomUUID()
}

/**
 * The main window's session id. Kept in sessionStorage, which is per tab and
 * survives a reload, so a detached window still recognises its main window
 * after the main window reloads.
 */
export function getMainWindowSessionId(): string {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY)
    if (stored) return stored
    const id = newSessionId()
    sessionStorage.setItem(SESSION_STORAGE_KEY, id)
    return id
  } catch {
    // sessionStorage unavailable: the session still works, it just won't
    // survive a reload of the main window.
    return newSessionId()
  }
}

export const usePanelSync = defineStore('panelSync', () => {
  let channel: BroadcastChannel | null = null
  let sessionId: string | null = null
  let role: PanelSyncRole | null = null
  // Prevents the window from re-broadcasting state it just received from
  // another window — avoids an infinite echo loop.
  let suppressBroadcast = false
  let initialized = false
  const stopWatchers: Array<() => void> = []

  function broadcast(message: PanelSyncMessage): void {
    if (!channel || sessionId === null) return
    const envelope: PanelSyncEnvelope = { sessionId, message }
    channel.postMessage(envelope)
  }

  // `beforeunload` fires on a close but also on a reload, so this "goodbye"
  // alone is not reliable. The "hello" sent from init() on every page load
  // corrects the state again after a reload.
  function onBeforeUnload(): void {
    broadcast({ type: role === 'main' ? 'MainWindowClosed' : 'KoppelingenPanelUnloading' })
  }

  async function handleMessage(msg: PanelSyncMessage): Promise<void> {
    const mappingsStore = useMappings()
    const panelDetachStore = usePanelDetach()
    const aiStore = useAISuggestions()
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
      } else if (msg.type === 'KoppelingenPanelOpened' && role === 'main') {
        panelDetachStore.onKoppelingenPanelOpened()
      } else if (msg.type === 'KoppelingenPanelUnloading' && role === 'main') {
        panelDetachStore.onKoppelingenPanelUnloading()
      } else if (msg.type === 'KoppelingenPanelReattached' && role === 'main') {
        panelDetachStore.onKoppelingenPanelReattached()
      } else if (msg.type === 'MainWindowOpened' && role === 'koppelingen-panel') {
        panelDetachStore.onMainWindowOpened()
        // The (re)loaded main window doesn't know this panel is open: tell it.
        broadcast({ type: 'KoppelingenPanelOpened' })
      } else if (msg.type === 'MainWindowClosed' && role === 'koppelingen-panel') {
        panelDetachStore.onMainWindowClosed()
      } else if (msg.type === 'ActiveTabChanged') {
        panelDetachStore.activeTab = msg.tab
      } else if (msg.type === 'AISuggestionsUpdated') {
        aiStore.suggestions = msg.suggestions
        aiStore.lowConfidenceSuggestions = msg.lowConfidenceSuggestions
      } else if (msg.type === 'PanelReady') {
        // Detached window is ready — send it the current state so it doesn't
        // start with an empty AI suggestions panel and wrong active tab.
        // broadcast() does not check suppressBroadcast; we leave it true so
        // any queued watcher jobs flushed in the finally nextTick are still
        // suppressed (they would echo state we just received).
        broadcast({
          type: 'AISuggestionsUpdated',
          suggestions: aiStore.suggestions.map(toRaw),
          lowConfidenceSuggestions: aiStore.lowConfidenceSuggestions.map(toRaw),
        })
        broadcast({ type: 'ActiveTabChanged', tab: panelDetachStore.activeTab })
      }
    } finally {
      // Wait for Vue to flush all reactive updates triggered by the store
      // mutations above before clearing the flag, so the watchers below
      // see suppressBroadcast = true and skip the echo broadcast.
      await nextTick()
      suppressBroadcast = false
    }
  }

  function init(options: { sessionId: string; role: PanelSyncRole }): void {
    if (initialized) return
    initialized = true
    sessionId = options.sessionId
    role = options.role

    channel = new BroadcastChannel(PANEL_SYNC_CHANNEL)
    channel.onmessage = (event: MessageEvent<PanelSyncEnvelope>) => {
      if (event.data?.sessionId !== sessionId) return
      void handleMessage(event.data.message)
    }

    const mappingsStore = useMappings()

    // Persistent state: broadcast a reload notification so other windows
    // re-read from the shared IndexedDB. This avoids serialising Schema
    // instances (which have methods and are not structuredClone-safe).
    stopWatchers.push(
      watch(
        () => mappingsStore.mappings,
        () => {
          if (suppressBroadcast) return
          broadcast({ type: 'MappingsUpdated' })
        },
      ),
      watch(
        () => mappingsStore.selectedMappingId,
        (id) => {
          if (suppressBroadcast) return
          broadcast({ type: 'SelectionChanged', mappingId: id })
        },
      ),
      watch(sourceSchemaResource.state, () => {
        if (suppressBroadcast) return
        broadcast({ type: 'SourceSchemaUpdated' })
      }),
      watch(targetSchemaResource.state, () => {
        if (suppressBroadcast) return
        broadcast({ type: 'TargetSchemaUpdated' })
      }),
    )

    window.addEventListener('beforeunload', onBeforeUnload)

    const panelDetachStore = usePanelDetach()
    stopWatchers.push(
      watch(
        () => panelDetachStore.activeTab,
        (tab) => {
          if (suppressBroadcast) return
          broadcast({ type: 'ActiveTabChanged', tab })
        },
      ),
    )

    const aiStore = useAISuggestions()
    stopWatchers.push(
      watch(
        [() => aiStore.suggestions, () => aiStore.lowConfidenceSuggestions],
        ([suggestions, lowConfidenceSuggestions]) => {
          if (suppressBroadcast) return
          broadcast({
            type: 'AISuggestionsUpdated',
            suggestions: suggestions.map(toRaw),
            lowConfidenceSuggestions: lowConfidenceSuggestions.map(toRaw),
          })
        },
      ),
    )

    // "Hello": announce this window on every page load, so a reload undoes
    // the goodbye that beforeunload sent just before it.
    broadcast({ type: role === 'main' ? 'MainWindowOpened' : 'KoppelingenPanelOpened' })
    // A reloaded main window that started in the detached layout now waits
    // for the detached window to answer the hello.
    if (role === 'main') usePanelDetach().expectDetachedConfirmation()
  }

  function destroy(): void {
    window.removeEventListener('beforeunload', onBeforeUnload)
    stopWatchers.splice(0).forEach((stop) => stop())
    channel?.close()
    channel = null
    sessionId = null
    role = null
    initialized = false
    suppressBroadcast = false
  }

  return { broadcast, init, destroy }
})
