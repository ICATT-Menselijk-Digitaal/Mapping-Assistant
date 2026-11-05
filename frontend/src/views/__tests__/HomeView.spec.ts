import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import HomeView from '../HomeView.vue'
import { usePanelDetach } from '@/composables/usePanelDetach'
import { usePanelSync, getMainWindowSessionId } from '@/composables/usePanelSync'

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  constructor() {
    MockBroadcastChannel.instances.push(this)
  }
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn<(msg: unknown) => void>()
  close = vi.fn<() => void>()
}
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

vi.mock('@/router', () => ({
  default: {
    resolve: (location: { query: { session: string } }) => ({
      href: `/panel/koppelingen?session=${location.query.session}`,
    }),
  },
}))

// Only the panel layout is under test here; the heavy children are stubbed.
const stubs = {
  MappingCanvas: { template: '<div data-testid="mapping-canvas" />' },
  MappingOverview: {
    emits: ['detach'],
    template:
      '<div data-testid="mapping-overview"><button data-testid="detach-koppelingen-panel" @click="$emit(\'detach\')" /></div>',
  },
  CouplingDetailPanel: true,
  ImportButton: true,
  ExportButton: true,
  ResizableSplit: {
    template: '<div data-testid="resizable-split"><slot name="left" /><slot name="right" /></div>',
  },
}

let pinia: Pinia
let wrapper: VueWrapper | null = null

async function mountHome() {
  wrapper = mount(HomeView, { global: { plugins: [pinia], stubs } })
  // init() runs once loadAll() has read IndexedDB; wait for it so it can't
  // land in a later test.
  await vi.waitFor(() => expect(MockBroadcastChannel.instances).toHaveLength(1))
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  MockBroadcastChannel.instances = []
  pinia = createPinia()
  setActivePinia(pinia)
  sessionStorage.clear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  usePanelSync().destroy()
  vi.restoreAllMocks()
})

describe('HomeView — detachable Koppelingspaneel', () => {
  it('shows the schema canvas and the Koppelingspaneel side by side by default', async () => {
    const wrapper = await mountHome()

    expect(wrapper.find('[data-testid="mapping-canvas"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mapping-overview"]').exists()).toBe(true)
  })

  // Scenario: Technical administrator detaches the Koppelingspaneel
  it('opens the panel window and removes the Koppelingspaneel from the main window', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const wrapper = await mountHome()

    await wrapper.find('[data-testid="detach-koppelingen-panel"]').trigger('click')

    expect(openSpy).toHaveBeenCalledWith(
      `/panel/koppelingen?session=${getMainWindowSessionId()}`,
      '_blank',
      expect.any(String),
    )
    expect(wrapper.find('[data-testid="mapping-overview"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="resizable-split"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mapping-canvas"]').exists()).toBe(true)
  })

  // Scenario: Closing the detached Koppelingspaneel window re-attaches it
  it('shows the Koppelingspaneel again after it is re-attached', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const wrapper = await mountHome()
    await wrapper.find('[data-testid="detach-koppelingen-panel"]').trigger('click')

    usePanelDetach().onKoppelingenPanelReattached()
    await flushPromises()

    expect(wrapper.find('[data-testid="mapping-overview"]').exists()).toBe(true)
  })

  it('shows a notice and keeps the panel in place when the pop-up is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const wrapper = await mountHome()

    await wrapper.find('[data-testid="detach-koppelingen-panel"]').trigger('click')

    expect(wrapper.find('[data-testid="koppelingen-panel-popup-blocked"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mapping-overview"]').exists()).toBe(true)
  })

  // Reload of the main window while detached: no flash of the panel.
  it('starts in the detached layout after a reload while the panel was detached', async () => {
    sessionStorage.setItem('ma_koppelingen_panel_detached', '1')

    wrapper = mount(HomeView, { global: { plugins: [pinia], stubs } })
    // Checked before any async work: the very first render is already detached.
    expect(wrapper.find('[data-testid="mapping-overview"]').exists()).toBe(false)

    await vi.waitFor(() => expect(MockBroadcastChannel.instances).toHaveLength(1))
    // The detached window answers the main window's hello.
    MockBroadcastChannel.instances[0]!.onmessage?.({
      data: { sessionId: getMainWindowSessionId(), message: { type: 'KoppelingenPanelOpened' } },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="mapping-overview"]').exists()).toBe(false)
  })
})
