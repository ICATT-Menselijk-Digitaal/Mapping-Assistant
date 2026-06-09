import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAISuggestions, AIServiceError } from '../useAISuggestions'
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
            { sourceField: 'firstName', targetField: 'first_name', confidenceScore: 0.95 },
            { sourceField: 'lastName', targetField: 'last_name', confidenceScore: 0.92 },
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
                        },
                        { sourceField: 'lastName', targetField: 'last_name', confidenceScore: 0.5 },
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
                        },
                        { sourceField: 'lastName', targetField: 'last_name', confidenceScore: 0.5 },
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
                        },
                        { sourceField: 'lastName', targetField: 'last_name', confidenceScore: 0.5 },
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
                      },
                      { sourceField: 'lastName', targetField: 'last_name', confidenceScore: 0.92 },
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
                  { sourceField: 'zaaktype', targetField: 'caseType', confidenceScore: 0.95 },
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
                  { sourceField: 'omschrijving', targetField: 'description', confidenceScore: 0.9 },
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
