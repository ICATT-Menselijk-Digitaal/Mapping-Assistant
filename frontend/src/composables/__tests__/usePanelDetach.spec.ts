import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  usePanelDetach,
  CLOSED_POLL_INTERVAL_MS,
  DETACHED_CONFIRMATION_TIMEOUT_MS,
  DETACHED_RELOAD_TIMEOUT_MS,
} from '../usePanelDetach'

// Mock the router so detachKoppelingenPanel can resolve a URL without a real
// browser environment.
vi.mock('@/router', () => ({
  default: {
    resolve: (location: { query: { session: string } }) => ({
      href: `/panel/koppelingen?session=${location.query.session}`,
    }),
  },
}))

const SESSION = 'session-a'

const DETACHED_KEY = 'ma_koppelingen_panel_detached'

beforeEach(() => {
  setActivePinia(createPinia())
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('usePanelDetach', () => {
  // Scenario: Technical administrator detaches the Koppelingspaneel
  it('marks Koppelingspaneel as detached when window.open succeeds', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const store = usePanelDetach()
    const result = store.detachKoppelingenPanel(SESSION)

    expect(result).toBe(true)
    expect(store.koppelingenPanelDetached).toBe(true)
    expect(store.koppelingenPanelPopupBlocked).toBe(false)
  })

  // Scenario: Detaching on a single monitor opens a regular browser window
  it('opens the Koppelingspaneel at its route, carrying the session id', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const store = usePanelDetach()
    store.detachKoppelingenPanel(SESSION)

    expect(openSpy).toHaveBeenCalledWith(
      '/panel/koppelingen?session=session-a',
      '_blank',
      expect.any(String),
    )
  })

  it('sets koppelingenPanelPopupBlocked and returns false when popup is blocked', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    const store = usePanelDetach()
    const result = store.detachKoppelingenPanel(SESSION)

    expect(result).toBe(false)
    expect(store.koppelingenPanelDetached).toBe(false)
    expect(store.koppelingenPanelPopupBlocked).toBe(true)
  })

  // Scenario: Closing the detached Koppelingspaneel window re-attaches it
  it('clears koppelingenPanelDetached when panel is reattached', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)

    const store = usePanelDetach()
    store.detachKoppelingenPanel(SESSION)
    expect(store.koppelingenPanelDetached).toBe(true)

    store.onKoppelingenPanelReattached()
    expect(store.koppelingenPanelDetached).toBe(false)
  })

  it('marks the panel as detached when the detached window announces itself', () => {
    const store = usePanelDetach()

    store.onKoppelingenPanelOpened()
    expect(store.koppelingenPanelDetached).toBe(true)
  })

  it('clears mainWindowClosed when the main window opens again', () => {
    const store = usePanelDetach()
    store.onMainWindowClosed()

    store.onMainWindowOpened()
    expect(store.mainWindowClosed).toBe(false)
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
    store.detachKoppelingenPanel(SESSION)
    expect(store.koppelingenPanelPopupBlocked).toBe(true)

    openSpy.mockReturnValueOnce({} as Window)
    store.detachKoppelingenPanel(SESSION)
    expect(store.koppelingenPanelPopupBlocked).toBe(false)
  })
})

// Reloading the main window while the panel is detached must not flash the
// Koppelingspaneel in the main window.
describe('usePanelDetach — main window reload', () => {
  it('starts attached when the panel was not detached before the reload', () => {
    const store = usePanelDetach()
    store.restoreDetachedState()

    expect(store.koppelingenPanelDetached).toBe(false)
  })

  it('starts detached when the panel was detached before the reload', () => {
    sessionStorage.setItem(DETACHED_KEY, '1')

    const store = usePanelDetach()
    store.restoreDetachedState()

    expect(store.koppelingenPanelDetached).toBe(true)
  })

  it('remembers detach and re-attach in the main window for the next reload', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const store = usePanelDetach()
    store.restoreDetachedState()

    store.detachKoppelingenPanel(SESSION)
    expect(sessionStorage.getItem(DETACHED_KEY)).toBe('1')

    store.onKoppelingenPanelReattached()
    expect(sessionStorage.getItem(DETACHED_KEY)).toBeNull()
  })

  it('does not remember anything when restoreDetachedState was not called (detached window)', () => {
    const store = usePanelDetach()

    store.onKoppelingenPanelOpened()

    expect(sessionStorage.getItem(DETACHED_KEY)).toBeNull()
  })

  it('stays detached when the detached window confirms in time', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(DETACHED_KEY, '1')
    const store = usePanelDetach()
    store.restoreDetachedState()
    store.expectDetachedConfirmation()

    store.onKoppelingenPanelOpened()
    vi.advanceTimersByTime(DETACHED_CONFIRMATION_TIMEOUT_MS)

    expect(store.koppelingenPanelDetached).toBe(true)
  })

  it('shows the panel again when the detached window does not confirm (closed during the reload)', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(DETACHED_KEY, '1')
    const store = usePanelDetach()
    store.restoreDetachedState()
    store.expectDetachedConfirmation()

    vi.advanceTimersByTime(DETACHED_CONFIRMATION_TIMEOUT_MS - 1)
    expect(store.koppelingenPanelDetached).toBe(true)

    vi.advanceTimersByTime(1)
    expect(store.koppelingenPanelDetached).toBe(false)
    expect(sessionStorage.getItem(DETACHED_KEY)).toBeNull()
  })

  it('does not start a confirmation timeout on a normal load', () => {
    vi.useFakeTimers()
    vi.spyOn(window, 'open').mockReturnValue({} as Window)
    const store = usePanelDetach()
    store.restoreDetachedState()
    store.expectDetachedConfirmation()

    store.detachKoppelingenPanel(SESSION)
    vi.advanceTimersByTime(DETACHED_CONFIRMATION_TIMEOUT_MS)

    expect(store.koppelingenPanelDetached).toBe(true)
  })
})

// The detached window's beforeunload fires on a close and on a reload. The
// main window tells them apart by checking whether the window really closed.
describe('usePanelDetach — detached window unloading', () => {
  function detachWithPopup(): {
    store: ReturnType<typeof usePanelDetach>
    popup: { closed: boolean }
  } {
    const popup = { closed: false }
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
    const store = usePanelDetach()
    store.detachKoppelingenPanel(SESSION)
    return { store, popup }
  }

  // Scenario: Closing the detached Koppelingspaneel window re-attaches it
  it('re-attaches as soon as the detached window has really closed', () => {
    vi.useFakeTimers()
    const { store, popup } = detachWithPopup()

    store.onKoppelingenPanelUnloading()
    expect(store.koppelingenPanelDetached).toBe(true)

    popup.closed = true
    vi.advanceTimersByTime(CLOSED_POLL_INTERVAL_MS)

    expect(store.koppelingenPanelDetached).toBe(false)
  })

  // Scenario: Reloading the detached window keeps the panel detached
  it('keeps the panel hidden while the detached window reloads, then stays detached on hello', () => {
    vi.useFakeTimers()
    const { store } = detachWithPopup()

    store.onKoppelingenPanelUnloading()
    vi.advanceTimersByTime(DETACHED_CONFIRMATION_TIMEOUT_MS * 3)
    expect(store.koppelingenPanelDetached).toBe(true)

    store.onKoppelingenPanelOpened()
    vi.advanceTimersByTime(DETACHED_RELOAD_TIMEOUT_MS)

    expect(store.koppelingenPanelDetached).toBe(true)
  })

  it('re-attaches after the safety timeout when the open window never says hello', () => {
    vi.useFakeTimers()
    const { store } = detachWithPopup()

    store.onKoppelingenPanelUnloading()
    vi.advanceTimersByTime(DETACHED_RELOAD_TIMEOUT_MS - 1)
    expect(store.koppelingenPanelDetached).toBe(true)

    vi.advanceTimersByTime(1)
    expect(store.koppelingenPanelDetached).toBe(false)
  })

  it('without a window handle (main window reloaded), re-attaches when no hello comes within the short timeout', () => {
    vi.useFakeTimers()
    const store = usePanelDetach()
    store.onKoppelingenPanelOpened()

    store.onKoppelingenPanelUnloading()
    vi.advanceTimersByTime(DETACHED_CONFIRMATION_TIMEOUT_MS - 1)
    expect(store.koppelingenPanelDetached).toBe(true)

    vi.advanceTimersByTime(1)
    expect(store.koppelingenPanelDetached).toBe(false)
  })

  it('ignores an unloading message when the panel is not detached', () => {
    vi.useFakeTimers()
    const store = usePanelDetach()

    store.onKoppelingenPanelUnloading()
    store.onKoppelingenPanelOpened()
    vi.advanceTimersByTime(DETACHED_RELOAD_TIMEOUT_MS)

    expect(store.koppelingenPanelDetached).toBe(true)
  })
})
