import { describe, it, expect } from 'vitest'
import { highlightSegments } from '../highlightSegments'

describe('highlightSegments', () => {
  // Scenario: Matching substring is highlighted in a directly matching field name
  it('returns a highlighted segment for the matching substring', () => {
    const result = highlightSegments('customerAddress', 'address')
    expect(result).toEqual([
      { text: 'customer', highlight: false },
      { text: 'Address', highlight: true },
    ])
  })

  // Scenario: Highlight is case-insensitive
  it('matches case-insensitively', () => {
    const result = highlightSegments('CustomerName', 'name')
    expect(result).toEqual([
      { text: 'Customer', highlight: false },
      { text: 'Name', highlight: true },
    ])
  })

  it('matches when query is uppercase', () => {
    const result = highlightSegments('customerName', 'NAME')
    expect(result).toEqual([
      { text: 'customer', highlight: false },
      { text: 'Name', highlight: true },
    ])
  })

  // Scenario: No highlight is shown when the search box is empty
  it('returns a single non-highlighted segment when query is empty', () => {
    expect(highlightSegments('someField', '')).toEqual([{ text: 'someField', highlight: false }])
  })

  // Edge case: Multiple occurrences
  it('highlights all occurrences of the query in a field name', () => {
    const result = highlightSegments('nameFullName', 'name')
    expect(result).toEqual([
      { text: 'name', highlight: true },
      { text: 'Full', highlight: false },
      { text: 'Name', highlight: true },
    ])
  })

  // Edge case: Query longer than text — no match
  it('returns a single non-highlighted segment when query does not match', () => {
    expect(highlightSegments('id', 'customerAddress')).toEqual([{ text: 'id', highlight: false }])
  })

  // Edge case: Full match
  it('returns a single highlighted segment when the full name matches', () => {
    expect(highlightSegments('street', 'street')).toEqual([{ text: 'street', highlight: true }])
  })
})
