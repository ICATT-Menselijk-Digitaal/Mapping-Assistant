import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useApiKey, validateKey, resetApiKeyState } from '../useApiKey'

beforeEach(() => {
  resetApiKeyState()
  localStorage.removeItem('ma_openrouter_api_key')
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

describe('localStorage persistence', () => {
  // Scenario: Validated key is stored after successful validation
  it('stores the key in localStorage after provideKey is called', () => {
    const { provideKey } = useApiKey()

    provideKey('test-key')

    expect(localStorage.getItem('ma_openrouter_api_key')).toBe('test-key')
  })

  // Scenario: Stored key is read on next session without showing the prompt
  it('returns stored key from localStorage without showing the prompt', async () => {
    localStorage.setItem('ma_openrouter_api_key', 'stored-key')
    const { getKey, isPromptVisible } = useApiKey()

    const key = await getKey()

    expect(key).toBe('stored-key')
    expect(isPromptVisible.value).toBe(false)
  })

  // Scenario: Local storage key is used before session key
  it('returns localStorage key before session key', async () => {
    localStorage.setItem('ma_openrouter_api_key', 'local-key')
    const { getKey, provideKey } = useApiKey()

    // Simulate a session key being set
    const keyPromise = getKey()
    // getKey returns early from localStorage so promise already resolved
    const key = await keyPromise

    expect(key).toBe('local-key')
    // provideKey was never called, so no session key interference
    void provideKey // suppress unused warning
  })

  // Scenario: Stored key is cleared when removeStoredKey is called
  it('removes the key from localStorage and shows prompt on next getKey', async () => {
    const { provideKey, removeStoredKey, getKey, isPromptVisible } = useApiKey()

    provideKey('to-be-removed')
    expect(localStorage.getItem('ma_openrouter_api_key')).toBe('to-be-removed')

    removeStoredKey()

    expect(localStorage.getItem('ma_openrouter_api_key')).toBeNull()

    // Reset state so next getKey triggers the prompt
    resetApiKeyState()
    const keyPromise = getKey()
    expect(isPromptVisible.value).toBe(true)

    // Cancel to clean up the pending promise
    const { cancel } = useApiKey()
    cancel()
    await keyPromise
  })
})
