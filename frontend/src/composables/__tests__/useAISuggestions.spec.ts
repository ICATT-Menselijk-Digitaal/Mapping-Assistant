import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import {
  useAISuggestions,
  AIServiceError,
  CONFIDENCE_THRESHOLD,
  MIN_CONFIDENCE_THRESHOLD,
  MAX_SUGGESTIONS_PER_SOURCE,
} from '../useAISuggestions'
import { useMappings } from '../useMappings'
import type { SchemaField } from '@/types'

const sourceFields: SchemaField[] = [
  { id: 'src-1', name: 'firstName', path: 'firstName', dataType: 'string', required: true },
  { id: 'src-2', name: 'lastName', path: 'lastName', dataType: 'string', required: true },
]

const unmappedTargetFields: SchemaField[] = [
  { id: 'tgt-1', name: 'first_name', path: 'first_name', dataType: 'string', required: true },
  { id: 'tgt-2', name: 'last_name', path: 'last_name', dataType: 'string', required: true },
]

const mockOpenRouterResponse = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          suggestions: [
            {
              sourceField: 'firstName',
              targetField: 'first_name',
              confidenceScore: 0.95,
              reasoning: 'Beide velden bevatten de voornaam van een persoon.',
            },
            {
              sourceField: 'lastName',
              targetField: 'last_name',
              confidenceScore: 0.92,
              reasoning: 'Beide velden bevatten de achternaam van een persoon.',
            },
          ],
        }),
      },
    },
  ],
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-api-key')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('useAISuggestions', () => {
  // Scenario: Fetch suggestions when both schemas are loaded
  it('returns a list of AI suggestions when source and target fields are provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) }),
    )

    const store = useAISuggestions()
    const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

    expect(result).toHaveLength(2)
    expect(store.suggestions).toEqual(result)
  })

  it('each suggestion contains a sourceFieldId, targetFieldId, and confidenceScore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) }),
    )

    const store = useAISuggestions()
    const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

    expect(result[0]).toMatchObject({
      sourceFieldId: 'src-1',
      targetFieldId: 'tgt-1',
      confidenceScore: 0.95,
      status: 'pending',
    })
    expect(result[1]).toMatchObject({
      sourceFieldId: 'src-2',
      targetFieldId: 'tgt-2',
      confidenceScore: 0.92,
      status: 'pending',
    })
  })

  // Scenario: All target fields are already mapped
  it('returns an empty list when there are no unmapped target fields', async () => {
    const fetchMock = vi.fn<() => never>()
    vi.stubGlobal('fetch', fetchMock)

    const store = useAISuggestions()
    const result = await store.generateSuggestions(sourceFields, [])

    expect(result).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // Scenario: AI service unreachable
  it('throws AIServiceError when the AI service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const store = useAISuggestions()
    await expect(store.generateSuggestions(sourceFields, unmappedTargetFields)).rejects.toThrow(
      AIServiceError,
    )
  })

  it('does not store any suggestions when the service is unreachable (fresh store)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const store = useAISuggestions()
    try {
      await store.generateSuggestions(sourceFields, unmappedTargetFields)
    } catch {
      // expected
    }

    expect(store.suggestions).toHaveLength(0)
  })

  it('preserves existing suggestions when the service is unreachable on retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const store = useAISuggestions()
    store.suggestions = [
      {
        id: 'existing',
        sourceFieldId: 'src-1',
        targetFieldId: 'tgt-1',
        confidenceScore: 0.95,
        status: 'pending',
      },
    ]

    try {
      await store.generateSuggestions(sourceFields, unmappedTargetFields)
    } catch {
      // expected
    }

    expect(store.suggestions).toHaveLength(1)
  })

  it('sets the error ref when the AI service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const store = useAISuggestions()
    try {
      await store.generateSuggestions(sourceFields, unmappedTargetFields)
    } catch {
      // expected
    }

    expect(store.error).toBeInstanceOf(AIServiceError)
  })

  it('sets the error ref when the API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) }),
    )

    const store = useAISuggestions()
    try {
      await store.generateSuggestions(sourceFields, unmappedTargetFields)
    } catch {
      // expected
    }

    expect(store.error).toBeInstanceOf(AIServiceError)
  })

  it('clears the error ref before a new generation attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) }),
    )

    const store = useAISuggestions()
    store.error = new AIServiceError('previous error')

    await store.generateSuggestions(sourceFields, unmappedTargetFields)

    expect(store.error).toBeNull()
  })

  it('throws AIServiceError when the API returns a non-OK status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({}) }),
    )

    const store = useAISuggestions()
    await expect(store.generateSuggestions(sourceFields, unmappedTargetFields)).rejects.toThrow(
      AIServiceError,
    )
  })

  it('throws AIServiceError when the API response cannot be parsed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: 'text', text: 'not-json' }] }),
      }),
    )

    const store = useAISuggestions()
    await expect(store.generateSuggestions(sourceFields, unmappedTargetFields)).rejects.toThrow(
      AIServiceError,
    )
  })

  // Scenario: Administrator acts on a low-confidence suggestion
  describe('low-confidence accept/reject', () => {
    it('accepts a low-confidence suggestion and removes it from lowConfidenceSuggestions', () => {
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'low-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ]

      aiStore.acceptSuggestion('low-1')

      expect(aiStore.lowConfidenceSuggestions).toHaveLength(0)
      expect(mappingsStore.mappings).toHaveLength(1)
      expect(aiStore.accepted).toBe(1)
    })

    it('rejects a low-confidence suggestion and removes it without creating a mapping', () => {
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      aiStore.lowConfidenceSuggestions = [
        {
          id: 'low-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.55,
          status: 'pending',
        },
      ]

      aiStore.rejectSuggestion('low-1')

      expect(aiStore.lowConfidenceSuggestions).toHaveLength(0)
      expect(mappingsStore.mappings).toHaveLength(0)
      expect(aiStore.rejected).toBe(1)
    })
  })

  // Scenario: Administrator accepts an AI suggestion
  describe('acceptSuggestion', () => {
    it('creates a field mapping and removes the suggestion from the list', () => {
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
      ]

      aiStore.acceptSuggestion('sug-1')

      expect(aiStore.suggestions).toHaveLength(0)
      expect(mappingsStore.mappings).toHaveLength(1)
      expect(mappingsStore.mappings[0]).toMatchObject({
        sourceFieldId: 'src-1',
        targetFieldId: 'tgt-1',
      })
    })

    it('does not create a duplicate mapping', () => {
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      mappingsStore.createMapping({ sourceFieldId: 'src-1', targetFieldId: 'tgt-1' })
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
      ]

      aiStore.acceptSuggestion('sug-1')

      expect(mappingsStore.mappings).toHaveLength(1)
      expect(aiStore.suggestions).toHaveLength(0)
    })
  })

  // Scenario: Administrator rejects an AI suggestion
  describe('rejectSuggestion', () => {
    it('removes the suggestion from the list without creating a mapping', () => {
      const aiStore = useAISuggestions()
      const mappingsStore = useMappings()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
      ]

      aiStore.rejectSuggestion('sug-1')

      expect(aiStore.suggestions).toHaveLength(0)
      expect(mappingsStore.mappings).toHaveLength(0)
    })
  })

  // Scenario: Rate is updated after acceptance
  describe('acceptance rate tracking', () => {
    it('increments accepted counter when a suggestion is accepted', () => {
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
      ]

      aiStore.acceptSuggestion('sug-1')

      expect(aiStore.accepted).toBe(1)
      expect(aiStore.rejected).toBe(0)
    })

    // Scenario: Rate is updated after rejection
    it('increments rejected counter when a suggestion is rejected', () => {
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
      ]

      aiStore.rejectSuggestion('sug-1')

      expect(aiStore.accepted).toBe(0)
      expect(aiStore.rejected).toBe(1)
    })

    it('tracks both accepted and rejected independently', () => {
      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
        {
          id: 'sug-2',
          sourceFieldId: 'src-2',
          targetFieldId: 'tgt-2',
          confidenceScore: 0.9,
          status: 'pending',
        },
      ]

      aiStore.acceptSuggestion('sug-1')
      aiStore.rejectSuggestion('sug-2')

      expect(aiStore.accepted).toBe(1)
      expect(aiStore.rejected).toBe(1)
    })

    it('counters persist across multiple generateSuggestions calls', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Beide velden bevatten de voornaam van een persoon.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const aiStore = useAISuggestions()
      aiStore.suggestions = [
        {
          id: 'sug-1',
          sourceFieldId: 'src-1',
          targetFieldId: 'tgt-1',
          confidenceScore: 0.95,
          status: 'pending',
        },
      ]
      aiStore.acceptSuggestion('sug-1')
      expect(aiStore.accepted).toBe(1)

      await aiStore.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(aiStore.accepted).toBe(1)
      expect(aiStore.rejected).toBe(0)
    })

    it('stores below-threshold suggestions in lowConfidenceSuggestions', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Beide velden bevatten de voornaam van een persoon.',
                        },
                        {
                          sourceField: 'lastName',
                          targetField: 'last_name',
                          confidenceScore: 0.5,
                          reasoning: 'Beide velden bevatten de achternaam van een persoon.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const aiStore = useAISuggestions()
      await aiStore.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(aiStore.suggestions).toHaveLength(1)
      expect(aiStore.lowConfidenceSuggestions).toHaveLength(1)
      expect(aiStore.lowConfidenceSuggestions[0]?.confidenceScore).toBe(0.5)
    })

    it('filters out suggestions below the 0.70 confidence threshold before storing', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Beide velden bevatten de voornaam van een persoon.',
                        },
                        {
                          sourceField: 'lastName',
                          targetField: 'last_name',
                          confidenceScore: 0.5,
                          reasoning: 'Beide velden bevatten de achternaam van een persoon.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const aiStore = useAISuggestions()
      await aiStore.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(aiStore.suggestions).toHaveLength(1)
      expect(aiStore.suggestions[0]?.confidenceScore).toBeGreaterThanOrEqual(0.7)
    })

    it('counts all AI suggestions (incl. below-threshold) in totalGenerated', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Beide velden bevatten de voornaam van een persoon.',
                        },
                        {
                          sourceField: 'lastName',
                          targetField: 'last_name',
                          confidenceScore: 0.5,
                          reasoning: 'Beide velden bevatten de achternaam van een persoon.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const aiStore = useAISuggestions()
      await aiStore.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(aiStore.totalGenerated).toBe(2)
    })

    it('accumulates totalGenerated across multiple generateSuggestions calls', async () => {
      vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
      const mockResponse = {
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    suggestions: [
                      {
                        sourceField: 'firstName',
                        targetField: 'first_name',
                        confidenceScore: 0.95,
                        reasoning: 'Beide velden bevatten de voornaam van een persoon.',
                      },
                      {
                        sourceField: 'lastName',
                        targetField: 'last_name',
                        confidenceScore: 0.92,
                        reasoning: 'Beide velden bevatten de achternaam van een persoon.',
                      },
                    ],
                  }),
                },
              },
            ],
          }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const aiStore = useAISuggestions()
      await aiStore.generateSuggestions(sourceFields, unmappedTargetFields)
      expect(aiStore.totalGenerated).toBe(2)

      await aiStore.generateSuggestions(sourceFields, unmappedTargetFields)
      expect(aiStore.totalGenerated).toBe(4)
    })
  })

  describe('sort order and suggestion filtering', () => {
    function mockResponse(pairs: Array<{ s: string; t: string; score: number }>) {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: pairs.map((p) => ({
                  sourceField: p.s,
                  targetField: p.t,
                  confidenceScore: p.score,
                  reasoning: `Veldnamen ${p.s} en ${p.t} komen sterk overeen.`,
                })),
              }),
            },
          },
        ],
      }
    }

    it('high-confidence suggestions are sorted from highest to lowest confidence', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse([
                { s: 'firstName', t: 'first_name', score: 0.75 },
                { s: 'lastName', t: 'last_name', score: 0.95 },
              ]),
            ),
        }),
      )

      const store = useAISuggestions()
      await store.generateSuggestions(sourceFields, unmappedTargetFields)

      const scores = store.suggestions.map((s) => s.confidenceScore)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
      expect(scores[0]).toBeGreaterThanOrEqual(scores[1] ?? 0)
    })

    it('low-confidence suggestions are sorted from highest to lowest confidence, independently', async () => {
      const extraSource: SchemaField = {
        id: 'src-3',
        name: 'email',
        path: 'email',
        dataType: 'string',
        required: false,
      }
      const extraTarget: SchemaField = {
        id: 'tgt-3',
        name: 'emailAddress',
        path: 'emailAddress',
        dataType: 'string',
        required: false,
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse([
                { s: 'firstName', t: 'first_name', score: 0.45 },
                { s: 'lastName', t: 'last_name', score: 0.65 },
                { s: 'email', t: 'emailAddress', score: 0.35 },
              ]),
            ),
        }),
      )

      const store = useAISuggestions()
      await store.generateSuggestions(
        [...sourceFields, extraSource],
        [...unmappedTargetFields, extraTarget],
      )

      const scores = store.lowConfidenceSuggestions.map((s) => s.confidenceScore)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })

    it(`filters out suggestions with confidence below ${MIN_CONFIDENCE_THRESHOLD}`, async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse([
                { s: 'firstName', t: 'first_name', score: 0.95 },
                { s: 'lastName', t: 'last_name', score: 0.29 },
              ]),
            ),
        }),
      )

      const store = useAISuggestions()
      await store.generateSuggestions(sourceFields, unmappedTargetFields)

      const all = [...store.suggestions, ...store.lowConfidenceSuggestions]
      expect(all.every((s) => s.confidenceScore >= MIN_CONFIDENCE_THRESHOLD)).toBe(true)
      expect(all).toHaveLength(1)
    })

    it(`shows at most ${MAX_SUGGESTIONS_PER_SOURCE} suggestions per source field`, async () => {
      const extraTarget1: SchemaField = {
        id: 'tgt-3',
        name: 'given_name',
        path: 'given_name',
        dataType: 'string',
        required: false,
      }
      const extraTarget2: SchemaField = {
        id: 'tgt-4',
        name: 'forename',
        path: 'forename',
        dataType: 'string',
        required: false,
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse([
                { s: 'firstName', t: 'first_name', score: 0.95 },
                { s: 'firstName', t: 'given_name', score: 0.85 },
                { s: 'firstName', t: 'forename', score: 0.75 },
              ]),
            ),
        }),
      )

      const store = useAISuggestions()
      await store.generateSuggestions(
        [sourceFields[0]!],
        [...unmappedTargetFields, extraTarget1, extraTarget2],
      )

      const all = [...store.suggestions, ...store.lowConfidenceSuggestions]
      const forSrc1 = all.filter((s) => s.sourceFieldId === 'src-1')
      expect(forSrc1).toHaveLength(MAX_SUGGESTIONS_PER_SOURCE)
      expect(forSrc1[0]!.confidenceScore).toBeGreaterThanOrEqual(forSrc1[1]!.confidenceScore)
    })

    it('all AI suggestions within the selected scope are rendered (no volume-based truncation)', async () => {
      const manySourceFields: SchemaField[] = Array.from({ length: 5 }, (_, i) => ({
        id: `src-${i + 1}`,
        name: `field${i + 1}`,
        path: `field${i + 1}`,
        dataType: 'string' as const,
        required: false,
      }))
      const manyTargetFields: SchemaField[] = Array.from({ length: 5 }, (_, i) => ({
        id: `tgt-${i + 1}`,
        name: `target${i + 1}`,
        path: `target${i + 1}`,
        dataType: 'string' as const,
        required: false,
      }))
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse(
                manySourceFields.map((f, i) => ({
                  s: f.path,
                  t: manyTargetFields[i]!.path,
                  score: 0.9,
                })),
              ),
            ),
        }),
      )

      const store = useAISuggestions()
      await store.generateSuggestions(manySourceFields, manyTargetFields)

      const all = [...store.suggestions, ...store.lowConfidenceSuggestions]
      expect(all).toHaveLength(5)
    })
  })

  // Scenario: Suggestion with coherent reasoning is shown to the administrator
  describe('reasoning', () => {
    it('attaches the AI-written reasoning to the returned suggestion', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Beide velden bevatten de voornaam van een persoon.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(result[0]?.reasoning).toBe('Beide velden bevatten de voornaam van een persoon.')
    })

    // Edge Case: MIN_REASONING_LENGTH must not reject a legitimately short reasoning
    it('does not filter out a short but legitimate reasoning', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Zelfde veldnaam.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(result).toHaveLength(1)
      expect(result[0]?.reasoning).toBe('Zelfde veldnaam.')
    })

    // Reviewer finding (Copilot): validation trims to check length/filler phrases,
    // but stored reasoning should not retain leading/trailing whitespace either
    it('trims surrounding whitespace from the stored reasoning', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: '  Beide velden bevatten de voornaam van een persoon.  ',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(result[0]?.reasoning).toBe('Beide velden bevatten de voornaam van een persoon.')
    })

    // Scenario: Generic filler reasoning is filtered out (Dutch — the reasoning
    // is shown to the administrator, see Task #112, so the AI writes it in Dutch)
    it('filters out a suggestion whose reasoning is empty or generic filler', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          reasoning: 'Dit lijkt een goede match',
                        },
                        {
                          sourceField: 'lastName',
                          targetField: 'last_name',
                          confidenceScore: 0.92,
                          reasoning: '',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(result).toHaveLength(0)
      expect(store.suggestions).toHaveLength(0)
      expect(store.lowConfidenceSuggestions).toHaveLength(0)
    })

    // Scenario: Unparseable reasoning is filtered out entirely
    it('filters out a suggestion entirely when its reasoning cannot be parsed as a string', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'firstName',
                          targetField: 'first_name',
                          confidenceScore: 0.95,
                          // reasoning omitted entirely — simulates a response the AI
                          // failed to include the field on, independently of confidenceScore
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions(sourceFields, unmappedTargetFields)

      expect(result).toHaveLength(0)
      expect(store.suggestions.some((s) => s.sourceFieldId === 'src-1')).toBe(false)
      expect(store.lowConfidenceSuggestions.some((s) => s.sourceFieldId === 'src-1')).toBe(false)
    })

    // Scenario: The AI is instructed to keep reasoning concise
    it('instructs the AI to write a concise, one-sentence Dutch reasoning per suggestion', async () => {
      const fetchMock = vi
        .fn<
          (
            url: string,
            init: RequestInit,
          ) => Promise<{ ok: true; json: () => Promise<typeof mockOpenRouterResponse> }>
        >()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) })
      vi.stubGlobal('fetch', fetchMock)

      const store = useAISuggestions()
      await store.generateSuggestions(sourceFields, unmappedTargetFields)

      const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
      const systemPrompt: string = requestBody.messages[0].content

      expect(systemPrompt).toContain('reasoning')
      expect(systemPrompt.toLowerCase()).toContain('dutch')
      expect(systemPrompt.toLowerCase()).toMatch(/concise|one sentence/)
    })
  })

  describe('type-aware suggestions', () => {
    function extractFieldEntries(fetchMock: ReturnType<typeof vi.fn>, side: 'Source' | 'Unmapped target') {
      const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
      const userMessage: string = requestBody.messages[1].content
      const prefix = `${side} fields: `
      const stopMarker = side === 'Source' ? '\n\nUnmapped target fields:' : '\n\nReturn JSON suggestions.'
      const json = userMessage.split(prefix)[1]!.split(stopMarker)[0]!
      return JSON.parse(json) as Array<Record<string, unknown>>
    }

    // Scenario: Suggestion run considers field type and constraints
    it("includes each field's data type, required flag, and max length in the request sent to the AI", async () => {
      const fetchMock = vi
        .fn<
          (
            url: string,
            init: RequestInit,
          ) => Promise<{ ok: true; json: () => Promise<typeof mockOpenRouterResponse> }>
        >()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) })
      vi.stubGlobal('fetch', fetchMock)

      const source: SchemaField = {
        id: 'src-1',
        name: 'firstName',
        path: 'firstName',
        dataType: 'string',
        required: true,
        maxLength: 50,
      }
      const target: SchemaField = {
        id: 'tgt-1',
        name: 'first_name',
        path: 'first_name',
        dataType: 'string',
        required: true,
        maxLength: 50,
      }

      const store = useAISuggestions()
      await store.generateSuggestions([source], [target])

      const sentSource = extractFieldEntries(fetchMock, 'Source')
      const sentTarget = extractFieldEntries(fetchMock, 'Unmapped target')
      expect(sentSource[0]).toMatchObject({ path: 'firstName', dataType: 'string', required: true, maxLength: 50 })
      expect(sentTarget[0]).toMatchObject({
        path: 'first_name',
        dataType: 'string',
        required: true,
        maxLength: 50,
      })
    })

    // Scenario: Missing constraint information does not block suggestion generation
    it('omits max length from the request when a field does not declare one', async () => {
      const fetchMock = vi
        .fn<
          (
            url: string,
            init: RequestInit,
          ) => Promise<{ ok: true; json: () => Promise<typeof mockOpenRouterResponse> }>
        >()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) })
      vi.stubGlobal('fetch', fetchMock)

      const sourceWithoutMaxLength: SchemaField = {
        id: 'src-1',
        name: 'firstName',
        path: 'firstName',
        dataType: 'string',
        required: true,
      }

      const store = useAISuggestions()
      const result = await store.generateSuggestions([sourceWithoutMaxLength], unmappedTargetFields)

      expect(result.length).toBeGreaterThan(0)
      const sentSource = extractFieldEntries(fetchMock, 'Source')
      expect(sentSource[0]).not.toHaveProperty('maxLength')
    })

    // Scenario: Type mismatch lowers a mapping suggestion's confidence score
    it('instructs the AI to score a type or constraint mismatch lower than an equivalent same-type match', async () => {
      const fetchMock = vi
        .fn<
          (
            url: string,
            init: RequestInit,
          ) => Promise<{ ok: true; json: () => Promise<typeof mockOpenRouterResponse> }>
        >()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) })
      vi.stubGlobal('fetch', fetchMock)

      const store = useAISuggestions()
      await store.generateSuggestions(sourceFields, unmappedTargetFields)

      const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
      const systemPrompt: string = requestBody.messages[0].content
      expect(systemPrompt.toLowerCase()).toContain('data type')
      expect(systemPrompt.toLowerCase()).toMatch(/mismatch/)
      expect(systemPrompt.toLowerCase()).toMatch(/lower/)
    })

    // Scenario: Suggestion reasoning names the specific type or constraint difference
    it('instructs the AI to name the specific type or constraint difference in the reasoning', async () => {
      const fetchMock = vi
        .fn<
          (
            url: string,
            init: RequestInit,
          ) => Promise<{ ok: true; json: () => Promise<typeof mockOpenRouterResponse> }>
        >()
        .mockResolvedValue({ ok: true, json: () => Promise.resolve(mockOpenRouterResponse) })
      vi.stubGlobal('fetch', fetchMock)

      const store = useAISuggestions()
      await store.generateSuggestions(sourceFields, unmappedTargetFields)

      const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body as string)
      const systemPrompt: string = requestBody.messages[0].content
      expect(systemPrompt.toLowerCase()).toMatch(/mismatch/)
      expect(systemPrompt.toLowerCase()).toContain('reasoning')
    })

    // Scenario: Partial constraint mismatch reflects a smaller confidence reduction
    it('passes through a smaller confidence reduction for a same-type pair with a required or max length difference', async () => {
      const partialMismatchSource: SchemaField = {
        id: 'src-1',
        name: 'notes',
        path: 'notes',
        dataType: 'string',
        required: false,
        maxLength: 500,
      }
      const partialMismatchTarget: SchemaField = {
        id: 'tgt-1',
        name: 'notes',
        path: 'notes',
        dataType: 'string',
        required: true,
        maxLength: 100,
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'notes',
                          targetField: 'notes',
                          confidenceScore: 0.8,
                          reasoning: 'Zelfde veldnaam, maar het doelveld is verplicht en korter.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions([partialMismatchSource], [partialMismatchTarget])

      expect(result[0]?.confidenceScore).toBe(0.8)
      expect(result[0]?.reasoning).toContain('verplicht')
    })

    // Scenario: Fundamentally incompatible field types still produce a suggestion
    it('still returns a suggestion for a fundamentally incompatible type pair, with a low confidence score', async () => {
      const booleanSource: SchemaField = {
        id: 'src-1',
        name: 'isActive',
        path: 'isActive',
        dataType: 'boolean',
        required: true,
      }
      const dateTarget: SchemaField = {
        id: 'tgt-1',
        name: 'activatedOn',
        path: 'activatedOn',
        dataType: 'date',
        required: true,
      }

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      suggestions: [
                        {
                          sourceField: 'isActive',
                          targetField: 'activatedOn',
                          confidenceScore: 0.35,
                          reasoning: 'Brontype boolean komt niet overeen met doeltype date.',
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
        }),
      )

      const store = useAISuggestions()
      const result = await store.generateSuggestions([booleanSource], [dateTarget])

      const all = [...result]
      expect(all).toHaveLength(1)
      expect(all[0]?.confidenceScore).toBeLessThan(CONFIDENCE_THRESHOLD)
    })
  })

  describe('rejected pairs filtering', () => {
    const zaaktypeField: SchemaField = {
      id: 'src-zaaktype',
      name: 'zaaktype',
      path: 'zaaktype',
      dataType: 'string',
      required: false,
    }
    const caseTypeField: SchemaField = {
      id: 'tgt-caseType',
      name: 'caseType',
      path: 'caseType',
      dataType: 'string',
      required: false,
    }
    const statusField: SchemaField = {
      id: 'src-status',
      name: 'status',
      path: 'status',
      dataType: 'string',
      required: false,
    }
    const statusCodeField: SchemaField = {
      id: 'tgt-statusCode',
      name: 'statusCode',
      path: 'statusCode',
      dataType: 'string',
      required: false,
    }
    const omschrijvingField: SchemaField = {
      id: 'src-omschrijving',
      name: 'omschrijving',
      path: 'omschrijving',
      dataType: 'string',
      required: false,
    }
    const descriptionField: SchemaField = {
      id: 'tgt-description',
      name: 'description',
      path: 'description',
      dataType: 'string',
      required: false,
    }

    // Scenario: Rejected pair does not reappear after re-generation
    it('rejected pair does not reappear after re-generation', async () => {
      const mockResponse = (pairs: Array<{ s: string; t: string; score: number }>) => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: pairs.map((p) => ({
                  sourceField: p.s,
                  targetField: p.t,
                  confidenceScore: p.score,
                  reasoning: `Veldnamen ${p.s} en ${p.t} komen sterk overeen.`,
                })),
              }),
            },
          },
        ],
      })

      const store = useAISuggestions()
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse([
                { s: 'zaaktype', t: 'caseType', score: 0.95 },
                { s: 'status', t: 'statusCode', score: 0.9 },
              ]),
            ),
        }),
      )
      await store.generateSuggestions(
        [zaaktypeField, statusField],
        [caseTypeField, statusCodeField],
      )

      const toReject = store.suggestions.find(
        (s) => s.sourceFieldId === 'src-zaaktype' && s.targetFieldId === 'tgt-caseType',
      )
      expect(toReject).toBeDefined()
      store.rejectSuggestion(toReject!.id)

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve(
              mockResponse([
                { s: 'zaaktype', t: 'caseType', score: 0.95 },
                { s: 'status', t: 'statusCode', score: 0.9 },
              ]),
            ),
        }),
      )
      await store.generateSuggestions(
        [zaaktypeField, statusField],
        [caseTypeField, statusCodeField],
      )

      const all = [...store.suggestions, ...store.lowConfidenceSuggestions]
      expect(
        all.some((s) => s.sourceFieldId === 'src-zaaktype' && s.targetFieldId === 'tgt-caseType'),
      ).toBe(false)
      expect(
        all.some((s) => s.sourceFieldId === 'src-status' && s.targetFieldId === 'tgt-statusCode'),
      ).toBe(true)
    })

    // Scenario: All previously rejected pairs filtered — empty state shown
    it('all previously rejected pairs filtered — empty state shown when AI returns only rejected pairs', async () => {
      const response = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    sourceField: 'zaaktype',
                    targetField: 'caseType',
                    confidenceScore: 0.95,
                    reasoning: 'Beide velden bevatten de classificatie van het zaaktype.',
                  },
                ],
              }),
            },
          },
        ],
      }

      const store = useAISuggestions()
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) }),
      )
      await store.generateSuggestions([zaaktypeField], [caseTypeField])
      ;[...store.suggestions, ...store.lowConfidenceSuggestions].forEach((s) =>
        store.rejectSuggestion(s.id),
      )

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) }),
      )
      await store.generateSuggestions([zaaktypeField], [caseTypeField])

      expect(store.suggestions).toHaveLength(0)
      expect(store.lowConfidenceSuggestions).toHaveLength(0)
    })

    // Scenario: AI returns a rejected pair — it is filtered before display
    it('AI returns a rejected pair — it is filtered before display', async () => {
      const store = useAISuggestions()
      store.suggestions = [
        {
          id: 'sug-omschrijving',
          sourceFieldId: 'src-omschrijving',
          targetFieldId: 'tgt-description',
          confidenceScore: 0.9,
          status: 'pending',
        },
      ]
      store.rejectSuggestion('sug-omschrijving')

      const response = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                suggestions: [
                  {
                    sourceField: 'omschrijving',
                    targetField: 'description',
                    confidenceScore: 0.9,
                    reasoning: 'Beide velden bevatten een vrije-tekst omschrijving.',
                  },
                ],
              }),
            },
          },
        ],
      }
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response) }),
      )
      await store.generateSuggestions([omschrijvingField], [descriptionField])

      const all = [...store.suggestions, ...store.lowConfidenceSuggestions]
      expect(
        all.some(
          (s) => s.sourceFieldId === 'src-omschrijving' && s.targetFieldId === 'tgt-description',
        ),
      ).toBe(false)
    })
  })
})
