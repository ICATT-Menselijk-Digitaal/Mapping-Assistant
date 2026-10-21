import { describe, it, expect } from 'vitest'
import { formatAmsterdamTime, parseAmsterdamTime } from '../amsterdamTime'

describe('formatAmsterdamTime', () => {
  it('writes summer time (UTC+2) as Amsterdam clock time', () => {
    expect(formatAmsterdamTime(new Date('2026-10-21T12:18:12.348Z'))).toBe('2026-10-21 14:18:12')
  })

  it('writes winter time (UTC+1) as Amsterdam clock time', () => {
    expect(formatAmsterdamTime(new Date('2026-11-02T12:00:00.000Z'))).toBe('2026-11-02 13:00:00')
  })
})

describe('parseAmsterdamTime', () => {
  it('reads an Amsterdam timestamp back to the same moment', () => {
    expect(parseAmsterdamTime('2026-10-21 14:18:12').toISOString()).toBe('2026-10-21T12:18:12.000Z')
  })

  it('still reads ISO timestamps saved before the switch to Amsterdam time', () => {
    expect(parseAmsterdamTime('2026-10-21T12:18:12.348Z').toISOString()).toBe(
      '2026-10-21T12:18:12.348Z',
    )
  })
})
