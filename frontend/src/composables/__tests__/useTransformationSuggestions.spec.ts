import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTransformationSuggestions } from '../useTransformationSuggestions'
import type { SchemaField } from '@/types'

function field(overrides: Partial<SchemaField>): SchemaField {
  return { id: crypto.randomUUID(), name: 'field', path: 'field', dataType: 'string', required: false, ...overrides }
}

function mockApiResponse(content: string) {
  return { ok: true, json: () => Promise.resolve({ choices: [{ message: { content } }] }) }
}

const srcString = field({ id: 'src', name: 'amount', path: 'amount', dataType: 'string' })
const tgtNumber = field({ id: 'tgt', name: 'total', path: 'total', dataType: 'number' })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('useTransformationSuggestions — generateSuggestion', () => {
  it('emits TransformationSuggestionGenerated with expression, explanation and example on success', async () => {
    const payload = JSON.stringify({
      expression: '$number($)',
      explanation: 'Converts a string to a number using JSONata $number()',
      example: { input: '"42"', output: '42' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm1', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m1']).toMatchObject({
      mappingId: 'm1',
      expression: '$number($)',
      explanation: expect.any(String),
      example: { input: '"42"', output: '42' },
    })
  })

  it('emits TransformationSuggestionGenerated with warning when AI cannot determine transformation', async () => {
    const payload = JSON.stringify({
      warning: 'Cannot safely split a full name without knowing the format',
      explanation: 'Please map the name parts manually',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm2', sourceField: srcString, targetField: tgtNumber })

    const suggestion = store.generatedSuggestions['m2']
    expect(suggestion).toBeDefined()
    expect(suggestion.warning).toBeDefined()
    expect(suggestion.expression).toBeUndefined()
  })

  it('does not emit TransformationSuggestionGenerated when AI service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm3', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m3']).toBeUndefined()
  })

  it('strips markdown fences and retries parse on malformed JSON wrapper', async () => {
    const inner = JSON.stringify({ expression: '$string($)', explanation: 'cast to string', example: { input: '42', output: '"42"' } })
    const payload = `\`\`\`json\n${inner}\n\`\`\``
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm4', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m4']?.expression).toBe('$string($)')
  })

  it('sets isLoading true while request is in flight', async () => {
    let resolve!: (v: Response) => void
    const pending = new Promise<Response>((r) => (resolve = r))
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))

    const store = useTransformationSuggestions()
    const gen = store.generateSuggestion({ mappingId: 'm5', sourceField: srcString, targetField: tgtNumber })

    expect(store.loadingMappingIds.has('m5')).toBe(true)

    const payload = JSON.stringify({ expression: '$string($)', explanation: 'x', example: { input: '1', output: '"1"' } })
    resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: payload } }] }) } as unknown as Response)
    await gen

    expect(store.loadingMappingIds.has('m5')).toBe(false)
  })
})
