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
  it('stores array of suggestions with expression, explanation and example on success', async () => {
    const payload = JSON.stringify([{
      mismatch: 'type mismatch: source is string, target is number',
      expression: '$number($)',
      explanation: 'Converteert een string naar een getal via JSONata $number()',
      example: { input: '"42"', output: '42' },
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm1', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m1']).toHaveLength(1)
    expect(store.generatedSuggestions['m1']![0]).toMatchObject({
      mappingId: 'm1',
      expression: '$number($)',
      explanation: expect.any(String),
      example: { input: '"42"', output: '42' },
    })
  })

  it('stores two suggestions when AI returns two mismatches', async () => {
    const payload = JSON.stringify([
      {
        mismatch: 'required mismatch: source is optional, target is required',
        expression: '$exists($) ? $ : ""',
        explanation: 'Gebruik een lege string als de bronwaarde ontbreekt.',
        example: { input: 'null', output: '""' },
      },
      {
        mismatch: 'length constraint: source has no max length, target is limited to 50',
        expression: '$substring($, 0, 47) & "..."',
        explanation: 'Kap de tekst af op 47 tekens.',
        example: { input: '"Een lange tekst"', output: '"Een lange tek..."' },
      },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const srcOpt = field({ id: 'src-opt', name: 'naam', path: 'naam', dataType: 'string', required: false })
    const tgtReqBounded = field({ id: 'tgt-req', name: 'naam_doel', path: 'naam_doel', dataType: 'string', required: true, maxLength: 50 })

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm1', sourceField: srcOpt, targetField: tgtReqBounded })

    expect(store.generatedSuggestions['m1']).toHaveLength(2)
    expect(store.generatedSuggestions['m1']![0]!.mismatch).toContain('required')
    expect(store.generatedSuggestions['m1']![1]!.mismatch).toContain('length')
  })

  it('stores warning suggestion when AI cannot determine transformation', async () => {
    const payload = JSON.stringify([{
      mismatch: 'type mismatch',
      warning: 'Kan geen veilige transformatie bepalen voor naamopsplitsing',
      explanation: 'Voer de transformatie handmatig in',
    }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm2', sourceField: srcString, targetField: tgtNumber })

    const suggestions = store.generatedSuggestions['m2']!
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]!.warning).toBeDefined()
    expect(suggestions[0]!.expression).toBeUndefined()
  })

  it('wraps a plain object response in an array for backward compatibility', async () => {
    const payload = JSON.stringify({
      expression: '$number($)',
      explanation: 'Converteert naar getal',
      example: { input: '"42"', output: '42' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm3', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m3']).toHaveLength(1)
    expect(store.generatedSuggestions['m3']![0]!.expression).toBe('$number($)')
  })

  it('does not store suggestions when AI service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm4', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m4']).toBeUndefined()
  })

  it('strips markdown fences and parses array response', async () => {
    const inner = JSON.stringify([{ mismatch: 'type', expression: '$string($)', explanation: 'cast naar string', example: { input: '42', output: '"42"' } }])
    const payload = `\`\`\`json\n${inner}\n\`\`\``
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm5', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m5']![0]?.expression).toBe('$string($)')
  })

  it('skips malformed items and returns the valid ones', async () => {
    const payload = JSON.stringify([
      { mismatch: 'type', expression: '$number($)', explanation: 'ok', example: { input: '"1"', output: '1' } },
      { mismatch: 'bad' }, // no expression or warning
      { mismatch: 'warn', warning: 'Niet bepaald', explanation: 'Handmatig invullen' },
    ])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockApiResponse(payload)))

    const store = useTransformationSuggestions()
    await store.generateSuggestion({ mappingId: 'm6', sourceField: srcString, targetField: tgtNumber })

    expect(store.generatedSuggestions['m6']).toHaveLength(2)
  })

  it('sets isLoading true while request is in flight', async () => {
    let resolve!: (v: Response) => void
    const pending = new Promise<Response>((r) => (resolve = r))
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))

    const store = useTransformationSuggestions()
    const gen = store.generateSuggestion({ mappingId: 'm7', sourceField: srcString, targetField: tgtNumber })

    expect(store.loadingMappingIds.has('m7')).toBe(true)

    const payload = JSON.stringify([{ mismatch: 'type', expression: '$string($)', explanation: 'x', example: { input: '1', output: '"1"' } }])
    resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: payload } }] }) } as unknown as Response)
    await gen

    expect(store.loadingMappingIds.has('m7')).toBe(false)
  })
})

describe('useTransformationSuggestions — acceptSuggestion', () => {
  it('removes accepted suggestion at index and stores the expression on the mapping', async () => {
    const store = useTransformationSuggestions()
    store.generatedSuggestions = {
      m1: [
        { mappingId: 'm1', mismatch: 'required', expression: '$exists($) ? $ : ""', explanation: 'standaard' },
        { mappingId: 'm1', mismatch: 'length', expression: '$substring($, 0, 47) & "..."', explanation: 'afkappen' },
      ],
    }

    store.acceptSuggestion('m1', '$exists($) ? $ : ""', 0)

    expect(store.generatedSuggestions['m1']).toHaveLength(1)
    expect(store.generatedSuggestions['m1']![0]!.mismatch).toBe('length')
  })

  it('removes the mapping entry entirely when last suggestion is accepted', async () => {
    const store = useTransformationSuggestions()
    store.generatedSuggestions = {
      m1: [{ mappingId: 'm1', mismatch: 'type', expression: '$number($)', explanation: 'getal' }],
    }

    store.acceptSuggestion('m1', '$number($)', 0)

    expect(store.generatedSuggestions['m1']).toBeUndefined()
  })
})
