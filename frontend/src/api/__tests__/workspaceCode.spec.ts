import { beforeEach, describe, expect, it } from 'vitest'
import {
  generateCode,
  getStoredCode,
  loadOrCreateCode,
  normalizeCode,
  setStoredCode,
} from '../workspaceCode'

describe('workspaceCode', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('generates a code from the unambiguous alphabet', () => {
    const code = generateCode()
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/)
    expect(code.length).toBeGreaterThanOrEqual(6)
  })

  it('persists and reloads the same code', () => {
    const code = loadOrCreateCode()
    expect(loadOrCreateCode()).toBe(code)
    expect(getStoredCode()).toBe(code)
  })

  it('setStoredCode overwrites the persisted code', () => {
    setStoredCode('ABC234')
    expect(getStoredCode()).toBe('ABC234')
  })

  it('normalizeCode trims and upper-cases', () => {
    expect(normalizeCode('  ab2x  ')).toBe('AB2X')
  })

  it('normalizeCode strips separators a pasted code may carry', () => {
    expect(normalizeCode('ab2x-9kdf')).toBe('AB2X9KDF')
    expect(normalizeCode('AB2X 9KDF')).toBe('AB2X9KDF')
    expect(normalizeCode('  a-b 2.x ')).toBe('AB2X')
  })
})
