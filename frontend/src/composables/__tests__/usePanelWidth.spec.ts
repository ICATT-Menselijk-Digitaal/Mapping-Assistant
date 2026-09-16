import { describe, it, expect, beforeEach } from 'vitest'
import {
  usePanelWidth,
  resetPanelWidthState,
  readStoredWidthPct,
  DEFAULT_KOPPELINGEN_WIDTH_PCT,
} from '../usePanelWidth'

beforeEach(() => {
  localStorage.clear()
  resetPanelWidthState()
})

describe('usePanelWidth', () => {
  // Scenario: New default ratio on a fresh workspace
  it('defaults to the new wider Koppelingen paneel ratio when nothing is stored', () => {
    const { koppelingenWidthPct } = usePanelWidth()
    expect(koppelingenWidthPct.value).toBe(DEFAULT_KOPPELINGEN_WIDTH_PCT)
    expect(DEFAULT_KOPPELINGEN_WIDTH_PCT).toBe(0.3)
  })

  // Scenario: Chosen width is remembered after reloading
  it('persists a chosen width so a fresh read reflects it, simulating a page reload', () => {
    const { setKoppelingenWidthPct } = usePanelWidth()
    setKoppelingenWidthPct(0.42)
    expect(readStoredWidthPct()).toBe(0.42)
  })

  it('updates the reactive ref immediately when a new width is set', () => {
    const { koppelingenWidthPct, setKoppelingenWidthPct } = usePanelWidth()
    setKoppelingenWidthPct(0.25)
    expect(koppelingenWidthPct.value).toBe(0.25)
  })

  it('falls back to the default when the stored value is corrupt', () => {
    localStorage.setItem('ma_koppelingen_panel_width_pct', 'not valid json')
    expect(readStoredWidthPct()).toBe(DEFAULT_KOPPELINGEN_WIDTH_PCT)
  })

  it('falls back to the default when the stored value is out of the valid (0,1) range', () => {
    localStorage.setItem('ma_koppelingen_panel_width_pct', JSON.stringify(1.5))
    expect(readStoredWidthPct()).toBe(DEFAULT_KOPPELINGEN_WIDTH_PCT)
  })
})
