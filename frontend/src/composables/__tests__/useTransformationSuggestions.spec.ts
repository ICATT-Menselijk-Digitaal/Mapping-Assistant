import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTransformationSuggestions } from '../useTransformationSuggestions'
import { useMappings } from '../useMappings'
import type { SchemaField } from '@/types'
import type { TransformationRule } from '@/types/mapping'

function field(overrides: Partial<SchemaField> = {}): SchemaField {
  return {
    id: crypto.randomUUID(),
    name: 'field',
    path: 'field',
    dataType: 'string',
    required: false,
    ...overrides,
  }
}

function makeApiResponse(content: string): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  } as unknown as Response
}

const srcLong = field({
  id: 'src',
  name: 'omschrijving',
  dataType: 'string',
  maxLength: 200,
  required: false,
})
const tgtShort = field({
  id: 'tgt',
  name: 'label',
  dataType: 'string',
  maxLength: 50,
  required: false,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-key')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('useTransformationSuggestions — generateSuggestion', () => {
  // Scenario: AI Suggestie generates a rule covering all detected mismatches
  it('appends a rule with source "ai", expression, explanation, and example on success', async () => {
    const payload = JSON.stringify({
      expression: '$substring($, 0, 47) & "..."',
      label: 'Afkappen',
      explanation: 'Kap de tekst af op 47 tekens.',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse(payload)))

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    const rules = mappingsStore.mappings.find((m) => m.id === mapping.id)!.transformations
    expect(rules).toHaveLength(1)
    expect(rules[0]!.source).toBe('ai')
    expect(rules[0]!.expression).toBe('$substring($, 0, 47) & "..."')
    expect(rules[0]!.aiExplanation).toBeDefined()
  })

  // Scenario: Existing rules are sent as context so the AI does not duplicate them
  it('includes existing rule expressions under "Bestaande regels (niet opnieuw voorstellen)" in the prompt', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({ ok: false } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const existingRule: TransformationRule = {
      id: 'r1',
      expression: '$string($)',
      label: 'test',
      source: 'manual',
    }

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [existingRule])

    expect(fetchSpy).toHaveBeenCalledOnce()
    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as {
      messages: Array<{ content: string }>
    }
    const prompt = body.messages[0]!.content
    expect(prompt).toContain('$string($)')
    expect(prompt).toContain('Bestaande regels (niet opnieuw voorstellen)')
  })

  // Scenario: Existing rules empty → prompt says "geen"
  it('writes "geen" when there are no existing rules', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({ ok: false } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as {
      messages: Array<{ content: string }>
    }
    expect(body.messages[0]!.content).toContain('- geen')
  })

  // Scenario: The prompt and raw response are logged to console.log
  it('logs the full prompt and raw response to console.log', async () => {
    const rawResponse = JSON.stringify({
      expression: '$string($)',
      label: 'Cast',
      explanation: 'Naar tekst',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse(rawResponse)))

    const consoleSpy = vi.spyOn(console, 'log')

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    const loggedStrings = consoleSpy.mock.calls.map((args) => String(args[0]))
    expect(loggedStrings.some((s) => s.includes('[AI Suggestie]') && s.includes('Bronveld'))).toBe(
      true,
    )
    expect(loggedStrings.some((s) => s.includes('[AI Suggestie]') && s.includes(rawResponse))).toBe(
      true,
    )
  })

  // Scenario: An invalid AI expression is silently discarded
  it('does not add a rule when AI returns a syntactically invalid JSONata expression', async () => {
    const payload = JSON.stringify({
      expression: ')invalid(',
      label: 'bad',
      explanation: 'test',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse(payload)))

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    expect(mappingsStore.mappings.find((m) => m.id === mapping.id)!.transformations).toHaveLength(0)
  })

  // Scenario: AI service unreachable — no error shown
  it('does not add a rule and does not throw when the AI API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await expect(
      store.generateSuggestion(mapping.id, srcLong, tgtShort, []),
    ).resolves.toBeUndefined()
    expect(mappingsStore.mappings.find((m) => m.id === mapping.id)!.transformations).toHaveLength(0)
  })

  it('uses max_tokens 300 in the API request', async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue({ ok: false } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    const body = JSON.parse(fetchSpy.mock.calls[0]![1]!.body as string) as { max_tokens: number }
    expect(body.max_tokens).toBe(300)
  })

  it('does not add a rule when the AI response has no expression field', async () => {
    const payload = JSON.stringify({ label: 'no expr', explanation: 'x' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeApiResponse(payload)))

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    expect(mappingsStore.mappings.find((m) => m.id === mapping.id)!.transformations).toHaveLength(0)
  })

  it('does not add a rule when the AI response is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeApiResponse('Sure! Here is a great expression for you.')),
    )

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    await store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    expect(mappingsStore.mappings.find((m) => m.id === mapping.id)!.transformations).toHaveLength(0)
  })

  it('sets isLoading true while the request is in flight and false after', async () => {
    let resolve!: (v: Response) => void
    const pending = new Promise<Response>((r) => (resolve = r))
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending))

    const mappingsStore = useMappings()
    const mapping = mappingsStore.createMapping({ sourceFieldId: 'src', targetFieldId: 'tgt' })!

    const store = useTransformationSuggestions()
    const gen = store.generateSuggestion(mapping.id, srcLong, tgtShort, [])

    expect(store.isLoading).toBe(true)

    const payload = JSON.stringify({
      expression: '$string($)',
      label: 'cast',
      explanation: 'x',
    })
    resolve(makeApiResponse(payload))
    await gen

    expect(store.isLoading).toBe(false)
  })
})
