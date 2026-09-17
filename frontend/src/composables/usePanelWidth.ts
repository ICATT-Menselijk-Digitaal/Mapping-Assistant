import { ref } from 'vue'

const STORAGE_KEY = 'ma_koppelingen_panel_width_pct'

// Feature #154: wider than the old fixed 320px sidebar.
export const DEFAULT_KOPPELINGEN_WIDTH_PCT = 0.3

// Stored (and read back) as a proportion of the available width, not a pixel
// count, so a narrower browser window than when the value was saved still
// renders correctly.
export function readStoredWidthPct(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return DEFAULT_KOPPELINGEN_WIDTH_PCT
    const parsed = JSON.parse(raw)
    return typeof parsed === 'number' && parsed > 0 && parsed < 1
      ? parsed
      : DEFAULT_KOPPELINGEN_WIDTH_PCT
  } catch {
    return DEFAULT_KOPPELINGEN_WIDTH_PCT
  }
}

const koppelingenWidthPct = ref<number>(readStoredWidthPct())

export function usePanelWidth() {
  // Updates the live value only — no localStorage write. Called on every
  // drag-move tick, so it must stay cheap; persisting on every tick would
  // mean dozens of synchronous localStorage writes per second during a fast
  // drag. Call persistKoppelingenWidthPct() once the drag ends instead.
  function setKoppelingenWidthPct(pct: number): void {
    koppelingenWidthPct.value = pct
  }

  function persistKoppelingenWidthPct(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(koppelingenWidthPct.value))
    } catch {
      // localStorage unavailable — best-effort persistence
    }
  }

  return { koppelingenWidthPct, setKoppelingenWidthPct, persistKoppelingenWidthPct }
}

export function resetPanelWidthState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  koppelingenWidthPct.value = DEFAULT_KOPPELINGEN_WIDTH_PCT
}
