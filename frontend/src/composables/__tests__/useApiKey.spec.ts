import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useApiKey, validateKey, resetApiKeyState } from '../useApiKey'

beforeEach(() => {
  resetApiKeyState()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('useApiKey', () => {
  // Scenario: No prompt shown when a team key is configured
  it('returns the env var key without showing the prompt', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'env-key-123')
    const { getKey, isPromptVisible } = useApiKey()

    const key = await getKey()

    expect(key).toBe('env-key-123')
    expect(isPromptVisible.value).toBe(false)
  })

  // Scenario: Trial Visitor triggers mapping/transformation suggestion without a key
  it('shows the prompt when no env var key is set', async () => {
    const { getKey, isPromptVisible, provideKey } = useApiKey()

    const keyPromise = getKey()
    expect(isPromptVisible.value).toBe(true)

    provideKey('visitor-key-abc')
    const key = await keyPromise

    expect(key).toBe('visitor-key-abc')
    expect(isPromptVisible.value).toBe(false)
  })

  // Scenario: Trial Visitor enters a key and the suggestion proceeds
  it('resolves with the entered key after provideKey is called', async () => {
    const { getKey, provideKey } = useApiKey()

    const keyPromise = getKey()
    provideKey('my-secret-key')

    expect(await keyPromise).toBe('my-secret-key')
  })

  // Scenario: Trial Visitor cancels the prompt
  it('resolves null and hides the prompt when cancelled', async () => {
    const { getKey, isPromptVisible, cancel } = useApiKey()

    const keyPromise = getKey()
    expect(isPromptVisible.value).toBe(true)

    cancel()
    const key = await keyPromise

    expect(key).toBeNull()
    expect(isPromptVisible.value).toBe(false)
  })

  it('reuses the session key for subsequent getKey calls without showing prompt again', async () => {
    const { getKey, isPromptVisible, provideKey } = useApiKey()

    const first = getKey()
    provideKey('reused-key')
    await first

    const second = await getKey()
    expect(second).toBe('reused-key')
    expect(isPromptVisible.value).toBe(false)
  })
})

describe('validateKey', () => {
  // Scenario: Trial Visitor submits a valid key
  it('returns "valid" when the API responds with 200', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }))

    const result = await validateKey('sk-or-valid')
    expect(result).toBe('valid')
  })

  // Scenario: Trial Visitor submits an invalid key (401)
  it('returns "invalid" when the API responds with 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }))

    const result = await validateKey('sk-or-bad')
    expect(result).toBe('invalid')
  })

  // Scenario: Trial Visitor submits an invalid key (403)
  it('returns "invalid" when the API responds with 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 403 }))

    const result = await validateKey('sk-or-forbidden')
    expect(result).toBe('invalid')
  })

  // Scenario: Validation call fails due to network error
  it('returns "unreachable" when fetch throws a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network failure'))

    const result = await validateKey('sk-or-any')
    expect(result).toBe('unreachable')
  })

  it('returns "unreachable" for unexpected non-200/401/403 status codes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 500 }))

    const result = await validateKey('sk-or-any')
    expect(result).toBe('unreachable')
  })

  // Scenario: Confirm button shows loading state while validating
  it('sets isValidating to true during validation and false after', async () => {
    const { isValidating } = useApiKey()

    let resolveFetch!: (value: Response) => void
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      }),
    )

    expect(isValidating.value).toBe(false)

    const validationPromise = validateKey('sk-or-key')
    expect(isValidating.value).toBe(true)

    resolveFetch(new Response(null, { status: 200 }))
    await validationPromise

    expect(isValidating.value).toBe(false)
  })
})
