import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePanelDetach } from '../usePanelDetach'

// Mock the router so detachKoppelingenPanel can resolve a URL without a real
// browser environment.
vi.mock('@/router', () => ({
  default: {
    resolve: (_location: { name: string }) => ({ href: '/panel/koppelingen' }),
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('usePanelDetach', () => {
  // Scenario: Technical administrator detaches the Koppelingspaneel
  it('marks Koppelingspaneel as detached when window.open succeeds', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const store = usePanelDetach()
    const result = store.detachKoppelingenPanel()

    expect(result).toBe(true)
    expect(store.koppelingenPanelDetached).toBe(true)
    expect(store.koppelingenPanelPopupBlocked).toBe(false)
  })

  // Scenario: Detaching on a single monitor opens a regular browser window
  it('opens the Koppelingspaneel at the correct route URL', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const store = usePanelDetach()
    store.detachKoppelingenPanel()

    expect(openSpy).toHaveBeenCalledWith('/panel/koppelingen', '_blank', expect.any(String))
  })

  it('sets koppelingenPanelPopupBlocked and returns false when popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    const store = usePanelDetach()
    const result = store.detachKoppelingenPanel()

    expect(result).toBe(false)
    expect(store.koppelingenPanelDetached).toBe(false)
    expect(store.koppelingenPanelPopupBlocked).toBe(true)
  })

  // Scenario: Closing the detached Koppelingspaneel window re-attaches it
  it('clears koppelingenPanelDetached when panel is reattached', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const store = usePanelDetach()
    store.detachKoppelingenPanel()
    expect(store.koppelingenPanelDetached).toBe(true)

    store.onKoppelingenPanelReattached()
    expect(store.koppelingenPanelDetached).toBe(false)
  })

  it('sets mainWindowClosed when main window closes', () => {
    const store = usePanelDetach()
    expect(store.mainWindowClosed).toBe(false)

    store.onMainWindowClosed()
    expect(store.mainWindowClosed).toBe(true)
  })

  it('clears koppelingenPanelPopupBlocked on a successful subsequent detach', () => {
    const openSpy = vi.spyOn(window, 'open')
    openSpy.mockReturnValueOnce(null)

    const store = usePanelDetach()
    store.detachKoppelingenPanel()
    expect(store.koppelingenPanelPopupBlocked).toBe(true)

    openSpy.mockReturnValueOnce({} as Window)
    store.detachKoppelingenPanel()
    expect(store.koppelingenPanelPopupBlocked).toBe(false)
  })
})
