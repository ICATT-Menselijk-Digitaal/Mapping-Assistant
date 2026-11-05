import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import PanelKoppelingenView from '../PanelKoppelingenView.vue'
import { usePanelDetach } from '@/composables/usePanelDetach'
import { usePanelSync } from '@/composables/usePanelSync'

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  postMessage = vi.fn<(msg: unknown) => void>()
  close = vi.fn<() => void>()
  constructor() {
    MockBroadcastChannel.instances.push(this)
  }
}
vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { session: 'session-a' } }),
}))

vi.mock('@/router', () => ({ default: { resolve: () => ({ href: '' }) } }))

const stubs = {
  MappingOverview: {
    props: ['detachLabel'],
    emits: ['detach'],
    template:
      '<button data-testid="detach-koppelingen-panel" @click="$emit(\'detach\')">{{ detachLabel }}</button>',
  },
  CouplingDetailPanel: true,
}

let pinia: Pinia
let wrapper: VueWrapper | null = null

async function mountPanel() {
  wrapper = mount(PanelKoppelingenView, { global: { plugins: [pinia], stubs } })
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
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  usePanelSync().destroy()
  vi.restoreAllMocks()
})

describe('PanelKoppelingenView', () => {
  it('announces itself to the main window of the session in its URL', async () => {
    await mountPanel()

    expect(MockBroadcastChannel.instances[0]!.postMessage).toHaveBeenCalledWith({
      sessionId: 'session-a',
      message: { type: 'KoppelingenPanelOpened' },
    })
  })

  it('labels the button "Terugplaatsen", tells the main window and closes itself when clicked', async () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})
    const wrapper = await mountPanel()

    const button = wrapper.find('[data-testid="detach-koppelingen-panel"]')
    expect(button.text()).toBe('Terugplaatsen')
    await button.trigger('click')

    expect(MockBroadcastChannel.instances[0]!.postMessage).toHaveBeenCalledWith({
      sessionId: 'session-a',
      message: { type: 'KoppelingenPanelReattached' },
    })
    expect(closeSpy).toHaveBeenCalled()
  })

  it('shows the "main window closed" banner only while the main window is closed', async () => {
    const wrapper = await mountPanel()
    const banner = () => wrapper.find('[data-testid="main-window-closed-banner"]')
    expect(banner().exists()).toBe(false)

    usePanelDetach().onMainWindowClosed()
    await flushPromises()
    expect(banner().exists()).toBe(true)

    usePanelDetach().onMainWindowOpened()
    await flushPromises()
    expect(banner().exists()).toBe(false)
  })
})
