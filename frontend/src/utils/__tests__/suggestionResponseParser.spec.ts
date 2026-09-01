import { describe, it, expect } from 'vitest'
import { extractSuggestions } from '../suggestionResponseParser'

describe('extractSuggestions', () => {
  it('parses a well-formed JSON response', () => {
    const raw = JSON.stringify({
      suggestions: [
        { sourceField: 'a', targetField: 'b', confidenceScore: 0.8, reasoning: 'looks alike' },
      ],
    })
    const result = extractSuggestions(raw)
    expect(result).toHaveLength(1)
    expect(result![0]).toMatchObject({ sourceField: 'a', targetField: 'b' })
  })

  it('returns [] for a JSON response with an explicitly empty suggestions array', () => {
    // A legitimate "no matches" answer — must not be conflated with parse failure.
    expect(extractSuggestions('{"suggestions":[]}')).toEqual([])
  })

  it('returns null when no "suggestions" key can be located', () => {
    // Distinguishes a genuine parse failure from an intentional empty result.
    expect(extractSuggestions('this is not json and has no suggestions key')).toBeNull()
  })

  it('recovers complete objects from a response cut off mid-object', () => {
    // Simulate a max_tokens truncation partway through the third object.
    const raw = `{"suggestions":[
      {"sourceField":"a","targetField":"b","confidenceScore":0.9,"reasoning":"r1"},
      {"sourceField":"c","targetField":"d","confidenceScore":0.7,"reasoning":"r2"},
      {"sourceField":"e","targetField":"f","confidence`
    const result = extractSuggestions(raw)
    expect(result).toHaveLength(2)
    expect(result![0]!.sourceField).toBe('a')
    expect(result![1]!.sourceField).toBe('c')
  })

  it('skips a malformed inner object but keeps neighbours', () => {
    // Middle object has an unquoted key — JSON.parse fails on it. Neighbours
    // survive because each `{...}` slice is parsed independently.
    const raw = `{"suggestions":[
      {"sourceField":"a","targetField":"b","confidenceScore":0.9,"reasoning":"r1"},
      {sourceField:"broken"},
      {"sourceField":"c","targetField":"d","confidenceScore":0.7,"reasoning":"r2"}
    ]}`
    const result = extractSuggestions(raw)
    expect(result!.map((s) => s.sourceField)).toEqual(['a', 'c'])
  })

  it('ignores braces inside string values when walking objects', () => {
    // A "}" inside a reasoning string used to close the object prematurely
    // before the string-aware scan was added.
    const raw = `{"suggestions":[
      {"sourceField":"a","targetField":"b","confidenceScore":0.9,"reasoning":"has } in text"}
    ]}`
    const result = extractSuggestions(raw)
    expect(result).toHaveLength(1)
    expect(result![0]!.reasoning).toBe('has } in text')
  })

  it('handles escaped quotes inside reasoning strings', () => {
    const raw = `{"suggestions":[
      {"sourceField":"a","targetField":"b","confidenceScore":0.9,"reasoning":"quoted \\"word\\" here"}
    ]}`
    const result = extractSuggestions(raw)
    expect(result).toHaveLength(1)
    expect(result![0]!.reasoning).toContain('"word"')
  })
})
