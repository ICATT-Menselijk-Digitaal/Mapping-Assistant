import { defineStore } from 'pinia'
import { ref } from 'vue'
import router from '@/router'

export type KoppelingenTab = 'koppelingen' | 'ai'

// Per tab and survives a reload (not a new browser session): lets the main
// window start a reload in the detached layout instead of flashing the panel.
const DETACHED_SESSION_KEY = 'ma_koppelingen_panel_detached'

/**
 * How long the main window waits for the detached window to say hello when it
 * can't check the window itself (no window handle, e.g. after the main window
 * reloaded). After that it assumes the detached window was closed.
 */
export const DETACHED_CONFIRMATION_TIMEOUT_MS = 1000

/** How often the main window checks whether the detached window really closed. */
export const CLOSED_POLL_INTERVAL_MS = 100

/**
 * Safety net when the main window does have a window handle: the detached
 * window is still open but never said hello (e.g. it was navigated to another
 * site). After this the panel comes back in the main window anyway.
 */
export const DETACHED_RELOAD_TIMEOUT_MS = 10_000

export const usePanelDetach = defineStore('panelDetach', () => {
  const koppelingenPanelDetached = ref(false)
  const koppelingenPanelPopupBlocked = ref(false)
  const mainWindowClosed = ref(false)
  const activeTab = ref<KoppelingenTab>('koppelingen')

  // Only the main window remembers the detached state (see restoreDetachedState).
  let persistDetachedState = false
  let awaitingConfirmation = false
  // Handle from window.open(). Lost when the main window reloads.
  let popupWindow: Window | null = null
  let waitTimer: ReturnType<typeof setTimeout> | null = null
  let closedPoll: ReturnType<typeof setInterval> | null = null

  function stopWaiting(): void {
    awaitingConfirmation = false
    if (waitTimer !== null) clearTimeout(waitTimer)
    if (closedPoll !== null) clearInterval(closedPoll)
    waitTimer = null
    closedPoll = null
  }

  function setDetached(detached: boolean): void {
    koppelingenPanelDetached.value = detached
    if (!persistDetachedState) return
    try {
      if (detached) sessionStorage.setItem(DETACHED_SESSION_KEY, '1')
      else sessionStorage.removeItem(DETACHED_SESSION_KEY)
    } catch {
      // sessionStorage unavailable: a reload will briefly show the panel again.
    }
  }

  function reattach(): void {
    stopWaiting()
    popupWindow = null
    setDetached(false)
  }

  /**
   * Keep the panel hidden until the detached window says hello again, or it
   * turns out to be gone. With a window handle the main window can see a real
   * close directly (`closed` stays false during a reload); without one it can
   * only wait a short while for the hello.
   */
  function waitForKoppelingenPanel(): void {
    stopWaiting()
    const popup = popupWindow
    if (popup) {
      closedPoll = setInterval(() => {
        if (popup.closed) reattach()
      }, CLOSED_POLL_INTERVAL_MS)
    }
    waitTimer = setTimeout(
      reattach,
      popup ? DETACHED_RELOAD_TIMEOUT_MS : DETACHED_CONFIRMATION_TIMEOUT_MS,
    )
  }

  /**
   * Main window only, called before the first render. Starts in the detached
   * layout when the panel was detached before a reload, and from then on
   * remembers the detached state for the next reload.
   */
  function restoreDetachedState(): void {
    persistDetachedState = true
    let wasDetached = false
    try {
      wasDetached = sessionStorage.getItem(DETACHED_SESSION_KEY) === '1'
    } catch {
      // sessionStorage unavailable: start attached.
    }
    if (!wasDetached) return
    koppelingenPanelDetached.value = true
    awaitingConfirmation = true
  }

  /**
   * Main window only, called once it has announced itself. If the panel was
   * restored as detached but the detached window doesn't confirm in time (it
   * was closed during the reload), the panel comes back.
   */
  function expectDetachedConfirmation(): void {
    if (!awaitingConfirmation) return
    waitForKoppelingenPanel()
  }

  /**
   * Opens the Koppelingspaneel in its own window. The main window's session id
   * goes in the URL so the detached window only listens to its own main window.
   */
  function detachKoppelingenPanel(sessionId: string): boolean {
    const url = router.resolve({ name: 'panel-koppelingen', query: { session: sessionId } }).href
    const win = window.open(url, '_blank', 'width=900,height=900')
    if (!win) {
      koppelingenPanelPopupBlocked.value = true
      return false
    }
    popupWindow = win
    koppelingenPanelPopupBlocked.value = false
    setDetached(true)
    return true
  }

  /** The detached window loaded (or reloaded) and said hello. */
  function onKoppelingenPanelOpened(): void {
    stopWaiting()
    koppelingenPanelPopupBlocked.value = false
    setDetached(true)
  }

  /** The detached window is unloading: closed or reloading, it can't tell which. */
  function onKoppelingenPanelUnloading(): void {
    if (!koppelingenPanelDetached.value) return
    waitForKoppelingenPanel()
  }

  /** "Terugplaatsen": the detached window is definitely going away. */
  function onKoppelingenPanelReattached(): void {
    reattach()
  }

  function onMainWindowOpened(): void {
    mainWindowClosed.value = false
  }

  function onMainWindowClosed(): void {
    mainWindowClosed.value = true
  }

  return {
    koppelingenPanelDetached,
    koppelingenPanelPopupBlocked,
    mainWindowClosed,
    activeTab,
    restoreDetachedState,
    expectDetachedConfirmation,
    detachKoppelingenPanel,
    onKoppelingenPanelOpened,
    onKoppelingenPanelUnloading,
    onKoppelingenPanelReattached,
    onMainWindowOpened,
    onMainWindowClosed,
  }
})
