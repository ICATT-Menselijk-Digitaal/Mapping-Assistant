import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import {
  usePanelSync,
  getMainWindowSessionId,
  PANEL_SYNC_CHANNEL,
  type PanelSyncMessage,
  type PanelSyncRole,
} from '../usePanelSync'
import { usePanelDetach } from '../usePanelDetach'
import { useMappings } from '../useMappings'
import { useAISuggestions } from '../useAISuggestions'

// ---------------------------------------------------------------------------
// BroadcastChannel mock
// ---------------------------------------------------------------------------

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn<(msg: unknown) => void>()
  close = vi.fn<() => void>()

  constructor(name: string) {
    this.name = name
    MockBroadcastChannel.instances.push(this)
  }

  /** Simulate receiving a message from another window. */
  simulateReceive(data: unknown): void {
    this.onmessage?.({ data })
  }

  static reset(): void {
    MockBroadcastChannel.instances = []
  }
}

vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

// Mock router (used by usePanelDetach)
vi.mock('@/router', () => ({
  default: {
    resolve: (location: { query: { session: string } }) => ({
      href: `/panel/koppelingen?session=${location.query.session}`,
    }),
  },
}))

const SESSION = 'session-a'
const OTHER_SESSION = 'session-b'

beforeEach(() => {
  MockBroadcastChannel.reset()
  sessionStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  // Ensure the store is torn down between tests.
  usePanelSync().destroy()
})

function getChannel(): MockBroadcastChannel {
  const ch = MockBroadcastChannel.instances.find((c) => c.name === PANEL_SYNC_CHANNEL)
  if (!ch) throw new Error('BroadcastChannel not created — did you call panelSync.init()?')
  return ch
}

function initAs(role: PanelSyncRole): MockBroadcastChannel {
  usePanelSync().init({ sessionId: SESSION, role })
  const ch = getChannel()
  ch.postMessage.mockClear()
  return ch
}

/** Deliver a message from another window, then let the async handler finish. */
async function receive(
  ch: MockBroadcastChannel,
  message: PanelSyncMessage,
  sessionId = SESSION,
): Promise<void> {
  ch.simulateReceive({ sessionId, message })
  await nextTick()
  await nextTick()
}

function sentMessages(ch: MockBroadcastChannel): PanelSyncMessage[] {
  return ch.postMessage.mock.calls.map(([env]) => (env as { message: PanelSyncMessage }).message)
}

describe('usePanelSync', () => {
  describe('channel lifecycle', () => {
    it('opens a BroadcastChannel with the correct name on init', () => {
      usePanelSync().init({ sessionId: SESSION, role: 'main' })

      expect(MockBroadcastChannel.instances).toHaveLength(1)
      expect(MockBroadcastChannel.instances[0]!.name).toBe(PANEL_SYNC_CHANNEL)
    })

    it('does not open a second channel on repeated init calls', () => {
      const panelSync = usePanelSync()
      panelSync.init({ sessionId: SESSION, role: 'main' })
      panelSync.init({ sessionId: SESSION, role: 'main' })

      expect(MockBroadcastChannel.instances).toHaveLength(1)
    })

    it('closes the channel on destroy', () => {
      const panelSync = usePanelSync()
      panelSync.init({ sessionId: SESSION, role: 'main' })
      const ch = getChannel()

      panelSync.destroy()
      expect(ch.close).toHaveBeenCalled()
    })

    it('broadcasts each change once after destroy and re-init (watchers are not duplicated)', async () => {
      const panelSync = usePanelSync()
      panelSync.init({ sessionId: SESSION, role: 'main' })
      panelSync.destroy()
      MockBroadcastChannel.reset()

      panelSync.init({ sessionId: SESSION, role: 'main' })
      const ch = getChannel()
      ch.postMessage.mockClear()
      useMappings().selectMapping('abc')
      await nextTick()

      expect(MockBroadcastChannel.instances).toHaveLength(1)
      expect(sentMessages(ch)).toEqual([{ type: 'SelectionChanged', mappingId: 'abc' }])
    })

    it('wraps every message with the session id', async () => {
      const ch = initAs('main')

      useMappings().selectMapping('abc')
      await nextTick()

      expect(ch.postMessage).toHaveBeenCalledWith({
        sessionId: SESSION,
        message: { type: 'SelectionChanged', mappingId: 'abc' },
      })
    })
  })

  // Scenario: Selecting a coupling is reflected across windows in real time
  describe('selection sync', () => {
    it('broadcasts SelectionChanged when selectedMappingId changes', async () => {
      const ch = initAs('main')

      useMappings().selectMapping('abc')
      await nextTick()

      expect(sentMessages(ch)).toContainEqual({ type: 'SelectionChanged', mappingId: 'abc' })
    })

    it('applies SelectionChanged from another window to the local store', async () => {
      const ch = initAs('koppelingen-panel')

      await receive(ch, { type: 'SelectionChanged', mappingId: 'xyz' })

      expect(useMappings().selectedMappingId).toBe('xyz')
    })

    it('applies SelectionChanged with null to clear the selection', async () => {
      const ch = initAs('koppelingen-panel')
      useMappings().selectMapping('abc')

      await receive(ch, { type: 'SelectionChanged', mappingId: null })

      expect(useMappings().selectedMappingId).toBeNull()
    })

    // No echo: a message received from another window must not be re-broadcast.
    it('does not re-broadcast a SelectionChanged received from another window', async () => {
      const ch = initAs('main')

      await receive(ch, { type: 'SelectionChanged', mappingId: 'abc' })

      expect(sentMessages(ch).filter((m) => m.type === 'SelectionChanged')).toHaveLength(0)
    })
  })

  // Scenario: Editing a coupling is reflected across windows in real time
  it('broadcasts MappingsUpdated when a mapping is created', async () => {
    const ch = initAs('main')

    useMappings().createMapping({ sourceFieldId: 's1', targetFieldId: 't1' })
    await nextTick()

    expect(sentMessages(ch)).toContainEqual({ type: 'MappingsUpdated' })
  })

  describe('window lifecycle', () => {
    it('main window announces itself with MainWindowOpened on init', () => {
      usePanelSync().init({ sessionId: SESSION, role: 'main' })

      expect(sentMessages(getChannel())).toEqual([{ type: 'MainWindowOpened' }])
    })

    it('detached window announces itself with KoppelingenPanelOpened on init', () => {
      usePanelSync().init({ sessionId: SESSION, role: 'koppelingen-panel' })

      expect(sentMessages(getChannel())).toEqual([{ type: 'KoppelingenPanelOpened' }])
    })

    it('main window sends MainWindowClosed on beforeunload', () => {
      const ch = initAs('main')

      window.dispatchEvent(new Event('beforeunload'))

      expect(sentMessages(ch)).toEqual([{ type: 'MainWindowClosed' }])
    })

    it('detached window sends KoppelingenPanelUnloading on beforeunload', () => {
      const ch = initAs('koppelingen-panel')

      window.dispatchEvent(new Event('beforeunload'))

      expect(sentMessages(ch)).toEqual([{ type: 'KoppelingenPanelUnloading' }])
    })

    it('stops sending on beforeunload after destroy', () => {
      const ch = initAs('main')
      usePanelSync().destroy()

      window.dispatchEvent(new Event('beforeunload'))

      expect(ch.postMessage).not.toHaveBeenCalled()
    })

    // "Terugplaatsen" in the detached window: unambiguous, so no waiting.
    it('main window re-attaches the panel right away when KoppelingenPanelReattached is received', async () => {
      const ch = initAs('main')
      const panelDetach = usePanelDetach()
      panelDetach.onKoppelingenPanelOpened()

      await receive(ch, { type: 'KoppelingenPanelReattached' })

      expect(panelDetach.koppelingenPanelDetached).toBe(false)
    })

    it('detached window shows the banner when MainWindowClosed is received', async () => {
      const ch = initAs('koppelingen-panel')

      await receive(ch, { type: 'MainWindowClosed' })

      expect(usePanelDetach().mainWindowClosed).toBe(true)
    })

    it('main window ignores MainWindowClosed (only meant for detached windows)', async () => {
      const ch = initAs('main')

      await receive(ch, { type: 'MainWindowClosed' })

      expect(usePanelDetach().mainWindowClosed).toBe(false)
    })

    // Reload of the detached window: goodbye, then hello again.
    it('main window hides the panel again when the detached window reloads', async () => {
      const ch = initAs('main')
      const panelDetach = usePanelDetach()
      panelDetach.onKoppelingenPanelOpened()

      await receive(ch, { type: 'KoppelingenPanelUnloading' })
      // No flash: the panel stays hidden in the main window while it reloads.
      expect(panelDetach.koppelingenPanelDetached).toBe(true)

      await receive(ch, { type: 'KoppelingenPanelOpened' })

      expect(panelDetach.koppelingenPanelDetached).toBe(true)
    })

    // Reload of the main window: goodbye, then hello again.
    it('detached window clears the banner and re-announces itself when the main window reloads', async () => {
      const ch = initAs('koppelingen-panel')

      await receive(ch, { type: 'MainWindowClosed' })
      expect(usePanelDetach().mainWindowClosed).toBe(true)

      await receive(ch, { type: 'MainWindowOpened' })

      expect(usePanelDetach().mainWindowClosed).toBe(false)
      expect(sentMessages(ch)).toContainEqual({ type: 'KoppelingenPanelOpened' })
    })

    // Two app tabs: messages from the other tab's session are ignored.
    it('ignores messages from another session', async () => {
      const ch = initAs('koppelingen-panel')

      await receive(ch, { type: 'MainWindowClosed' }, OTHER_SESSION)
      await receive(ch, { type: 'SelectionChanged', mappingId: 'xyz' }, OTHER_SESSION)

      expect(usePanelDetach().mainWindowClosed).toBe(false)
      expect(useMappings().selectedMappingId).toBeNull()
    })
  })

  // Scenario: Switching tabs (koppelingen / ai) is reflected across windows in real time
  describe('active tab sync', () => {
    it('broadcasts ActiveTabChanged when activeTab changes', async () => {
      const ch = initAs('main')

      usePanelDetach().activeTab = 'ai'
      await nextTick()

      expect(sentMessages(ch)).toContainEqual({ type: 'ActiveTabChanged', tab: 'ai' })
    })

    it('applies ActiveTabChanged from another window to the local store', async () => {
      const ch = initAs('koppelingen-panel')

      await receive(ch, { type: 'ActiveTabChanged', tab: 'ai' })

      expect(usePanelDetach().activeTab).toBe('ai')
    })

    it('does not re-broadcast an ActiveTabChanged received from another window', async () => {
      const ch = initAs('main')

      await receive(ch, { type: 'ActiveTabChanged', tab: 'ai' })

      expect(sentMessages(ch).filter((m) => m.type === 'ActiveTabChanged')).toHaveLength(0)
    })
  })

  // Scenario: AI suggestions generated in the main window appear in the detached panel
  describe('AI suggestions sync', () => {
    it('broadcasts AISuggestionsUpdated when suggestions change', async () => {
      const ch = initAs('main')
      const aiStore = useAISuggestions()

      aiStore.suggestions = [
        {
          id: 's1-t1',
          sourceFieldId: 's1',
          targetFieldId: 't1',
          confidenceScore: 0.9,
          reasoning: 'test',
          status: 'pending',
        },
      ]
      await nextTick()

      const msgs = sentMessages(ch).filter((m) => m.type === 'AISuggestionsUpdated')
      expect(msgs).toHaveLength(1)
    })

    it('applies AISuggestionsUpdated from another window to the local store', async () => {
      const ch = initAs('koppelingen-panel')
      const suggestion = {
        id: 's1-t1',
        sourceFieldId: 's1',
        targetFieldId: 't1',
        confidenceScore: 0.9,
        reasoning: 'test',
        status: 'pending' as const,
      }

      await receive(ch, {
        type: 'AISuggestionsUpdated',
        suggestions: [suggestion],
        lowConfidenceSuggestions: [],
      })

      expect(useAISuggestions().suggestions).toEqual([suggestion])
      expect(useAISuggestions().lowConfidenceSuggestions).toEqual([])
    })

    it('does not re-broadcast an AISuggestionsUpdated received from another window', async () => {
      const ch = initAs('main')

      await receive(ch, {
        type: 'AISuggestionsUpdated',
        suggestions: [],
        lowConfidenceSuggestions: [],
      })

      expect(sentMessages(ch).filter((m) => m.type === 'AISuggestionsUpdated')).toHaveLength(0)
    })

    it('broadcasts plain objects, not Vue proxies (guards the toRaw() fix)', async () => {
      const ch = initAs('main')
      const aiStore = useAISuggestions()
      const suggestion = {
        id: 's1-t1',
        sourceFieldId: 's1',
        targetFieldId: 't1',
        confidenceScore: 0.9,
        reasoning: 'test',
        status: 'pending' as const,
      }

      aiStore.suggestions = [suggestion]
      await nextTick()

      const msg = sentMessages(ch).find((m) => m.type === 'AISuggestionsUpdated') as Extract<
        PanelSyncMessage,
        { type: 'AISuggestionsUpdated' }
      >
      expect(msg).toBeDefined()
      // toRaw() strips the Vue reactive proxy — structuredClone would throw on a Proxy
      expect(() => structuredClone(msg.suggestions)).not.toThrow()
    })
  })

  // Scenario: Detached window loads and needs the current state from the main window
  describe('PanelReady handshake', () => {
    it('main window replies with AISuggestionsUpdated and ActiveTabChanged when PanelReady is received', async () => {
      const ch = initAs('main')
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 's1-t1',
          sourceFieldId: 's1',
          targetFieldId: 't1',
          confidenceScore: 0.9,
          reasoning: 'test',
          status: 'pending' as const,
        },
      ]
      usePanelDetach().activeTab = 'ai'
      ch.postMessage.mockClear()

      await receive(ch, { type: 'PanelReady' })

      const msgs = sentMessages(ch)
      expect(msgs).toContainEqual(expect.objectContaining({ type: 'AISuggestionsUpdated' }))
      expect(msgs).toContainEqual({ type: 'ActiveTabChanged', tab: 'ai' })
    })

    it('the AISuggestionsUpdated reply contains plain objects, not Vue proxies', async () => {
      const ch = initAs('main')
      useAISuggestions().suggestions = [
        {
          id: 's1-t1',
          sourceFieldId: 's1',
          targetFieldId: 't1',
          confidenceScore: 0.9,
          reasoning: 'test',
          status: 'pending' as const,
        },
      ]
      ch.postMessage.mockClear()

      await receive(ch, { type: 'PanelReady' })

      const msg = sentMessages(ch).find((m) => m.type === 'AISuggestionsUpdated') as Extract<
        PanelSyncMessage,
        { type: 'AISuggestionsUpdated' }
      >
      expect(msg).toBeDefined()
      expect(() => structuredClone(msg.suggestions)).not.toThrow()
    })
  })

  describe('getMainWindowSessionId', () => {
    it('returns the same id on every call within a tab (survives a reload)', () => {
      const first = getMainWindowSessionId()

      expect(first).toMatch(/.+/)
      expect(getMainWindowSessionId()).toBe(first)
    })

    it('creates a new id when the tab has none yet', () => {
      const first = getMainWindowSessionId()
      sessionStorage.clear()

      expect(getMainWindowSessionId()).not.toBe(first)
    })
  })
})
