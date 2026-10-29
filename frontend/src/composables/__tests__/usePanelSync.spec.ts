import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { usePanelSync, PANEL_SYNC_CHANNEL } from '../usePanelSync'
import { usePanelDetach } from '../usePanelDetach'
import { useMappings } from '../useMappings'

// ---------------------------------------------------------------------------
// BroadcastChannel mock
// ---------------------------------------------------------------------------

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  name: string
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn<[unknown], void>()
  close = vi.fn<[], void>()

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
    resolve: (location: { name: string }) => ({
      href: `/${location.name}`,
    }),
  },
}))

beforeEach(() => {
  MockBroadcastChannel.reset()
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

describe('usePanelSync', () => {
  // Scenario: init creates the channel exactly once
  it('opens a BroadcastChannel with the correct name on init', () => {
    const panelSync = usePanelSync()
    panelSync.init()

    expect(MockBroadcastChannel.instances).toHaveLength(1)
    expect(MockBroadcastChannel.instances[0]!.name).toBe(PANEL_SYNC_CHANNEL)
  })

  it('does not open a second channel on repeated init calls', () => {
    const panelSync = usePanelSync()
    panelSync.init()
    panelSync.init()

    expect(MockBroadcastChannel.instances).toHaveLength(1)
  })

  // Scenario: SelectionChanged is reflected across windows in real time
  it('broadcasts SelectionChanged when selectedMappingId changes', async () => {
    const panelSync = usePanelSync()
    const mappingsStore = useMappings()
    panelSync.init()

    mappingsStore.selectMapping('abc')
    await nextTick()

    const ch = getChannel()
    expect(ch.postMessage).toHaveBeenCalledWith({
      type: 'SelectionChanged',
      mappingId: 'abc',
    })
  })

  it('broadcasts MappingsUpdated when a mapping is created', async () => {
    const panelSync = usePanelSync()
    const mappingsStore = useMappings()
    panelSync.init()

    mappingsStore.createMapping({ sourceFieldId: 's1', targetFieldId: 't1' })
    await nextTick()

    const ch = getChannel()
    expect(ch.postMessage).toHaveBeenCalledWith({ type: 'MappingsUpdated' })
  })

  // Scenario: Selecting a coupling is reflected across windows in real time
  it('applies SelectionChanged from another window to the local store', async () => {
    const panelSync = usePanelSync()
    const mappingsStore = useMappings()
    panelSync.init()

    const ch = getChannel()
    ch.simulateReceive({ type: 'SelectionChanged', mappingId: 'xyz' })
    await nextTick()
    await nextTick()

    expect(mappingsStore.selectedMappingId).toBe('xyz')
  })

  it('applies SelectionChanged with null to clear the selection', async () => {
    const panelSync = usePanelSync()
    const mappingsStore = useMappings()
    panelSync.init()
    mappingsStore.selectMapping('abc')

    const ch = getChannel()
    ch.simulateReceive({ type: 'SelectionChanged', mappingId: null })
    await nextTick()
    await nextTick()

    expect(mappingsStore.selectedMappingId).toBeNull()
  })

  // Scenario: Closing the detached schema panel window re-attaches it
  it('calls onSchemaPanelReattached when SchemaPanelReattached is received', async () => {
    const panelSync = usePanelSync()
    const panelDetach = usePanelDetach()
    panelSync.init()

    // Mark as detached first so there is something to reattach.
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    panelDetach.detachSchemaPanel()
    expect(panelDetach.schemaPanelDetached).toBe(true)

    const ch = getChannel()
    ch.simulateReceive({ type: 'SchemaPanelReattached' })
    await nextTick()
    await nextTick()

    expect(panelDetach.schemaPanelDetached).toBe(false)
  })

  // Scenario: Closing the detached Koppelingspaneel window re-attaches it
  it('calls onKoppelingenPanelReattached when KoppelingenPanelReattached is received', async () => {
    const panelSync = usePanelSync()
    const panelDetach = usePanelDetach()
    panelSync.init()

    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    panelDetach.detachKoppelingenPanel()
    expect(panelDetach.koppelingenPanelDetached).toBe(true)

    const ch = getChannel()
    ch.simulateReceive({ type: 'KoppelingenPanelReattached' })
    await nextTick()
    await nextTick()

    expect(panelDetach.koppelingenPanelDetached).toBe(false)
  })

  it('sets mainWindowClosed when MainWindowClosed is received', async () => {
    const panelSync = usePanelSync()
    const panelDetach = usePanelDetach()
    panelSync.init()

    const ch = getChannel()
    ch.simulateReceive({ type: 'MainWindowClosed' })
    await nextTick()
    await nextTick()

    expect(panelDetach.mainWindowClosed).toBe(true)
  })

  // No echo: a message received from another window must not be re-broadcast.
  it('does not re-broadcast a SelectionChanged received from another window', async () => {
    const panelSync = usePanelSync()
    panelSync.init()

    const ch = getChannel()
    ch.postMessage.mockClear()

    ch.simulateReceive({ type: 'SelectionChanged', mappingId: 'abc' })
    await nextTick()
    await nextTick()

    // The only postMessage call allowed is the one the test might trigger
    // by interacting with the store — not an echo of the received message.
    const selectionChangedCalls = (ch.postMessage.mock.calls as Array<[unknown]>).filter(
      ([msg]) => (msg as { type: string }).type === 'SelectionChanged',
    )
    expect(selectionChangedCalls).toHaveLength(0)
  })

  // destroy() closes the channel
  it('closes the channel on destroy', () => {
    const panelSync = usePanelSync()
    panelSync.init()
    const ch = getChannel()

    panelSync.destroy()
    expect(ch.close).toHaveBeenCalled()
  })

  it('allows re-initialisation after destroy', () => {
    const panelSync = usePanelSync()
    panelSync.init()
    panelSync.destroy()
    MockBroadcastChannel.reset()

    panelSync.init()
    expect(MockBroadcastChannel.instances).toHaveLength(1)
  })
})
