import { describe, it, expect, afterEach } from 'vitest'
import { useTargetScopeFlag } from '../useTargetScopeFlag'

afterEach(() => {
  window.history.replaceState({}, '', '/')
})

describe('useTargetScopeFlag', () => {
  it('is enabled when ?targetScope=1 is present in the URL', () => {
    window.history.replaceState({}, '', '/?targetScope=1')

    const { targetScopeEnabled } = useTargetScopeFlag()

    expect(targetScopeEnabled.value).toBe(true)
  })

  it('is disabled when the targetScope query parameter is absent', () => {
    window.history.replaceState({}, '', '/')

    const { targetScopeEnabled } = useTargetScopeFlag()

    expect(targetScopeEnabled.value).toBe(false)
  })

  it('is disabled for any value other than exactly "1"', () => {
    window.history.replaceState({}, '', '/?targetScope=true')

    const { targetScopeEnabled } = useTargetScopeFlag()

    expect(targetScopeEnabled.value).toBe(false)
  })
})
