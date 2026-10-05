import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatRelativeTime } from '../formatRelativeTime'

const NOW = new Date('2026-01-15T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString()
}

describe('formatRelativeTime', () => {
  it('returns "zojuist" for under a minute ago', () => {
    expect(formatRelativeTime(ago(30 * 1000))).toBe('zojuist')
  })

  it('uses singular "minuut" for exactly one minute ago', () => {
    expect(formatRelativeTime(ago(60 * 1000))).toBe('1 minuut geleden')
  })

  it('uses plural "minuten" for multiple minutes ago', () => {
    expect(formatRelativeTime(ago(18 * 60 * 1000))).toBe('18 minuten geleden')
  })

  it('uses "uur" for exactly one hour ago', () => {
    expect(formatRelativeTime(ago(60 * 60 * 1000))).toBe('1 uur geleden')
  })

  it('uses "uur" for multiple hours ago too', () => {
    expect(formatRelativeTime(ago(5 * 60 * 60 * 1000))).toBe('5 uur geleden')
  })

  it('uses singular "dag" for exactly one day ago', () => {
    expect(formatRelativeTime(ago(24 * 60 * 60 * 1000))).toBe('1 dag geleden')
  })

  it('uses plural "dagen" for multiple days ago', () => {
    expect(formatRelativeTime(ago(3 * 24 * 60 * 60 * 1000))).toBe('3 dagen geleden')
  })

  it('falls back to an absolute date beyond 30 days ago', () => {
    const result = formatRelativeTime(ago(45 * 24 * 60 * 60 * 1000))
    expect(result).not.toContain('geleden')
    expect(result).toMatch(/\d/)
  })
})
